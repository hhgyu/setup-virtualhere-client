import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

import * as core from '@actions/core';
import {
  HTTPError,
  IToolRelease,
  cacheDir,
  downloadTool,
  extractTar,
  extractZip,
  find,
  findFromManifest,
  getManifestFromRepo
} from '@actions/tool-cache';
import {prerelease, major, minor, coerce, valid} from 'semver';

export interface IVCVersionFile {
  filename: string;
  // darwin, linux, windows
  os: string;
  arch: string;
}

export interface IVCVersion {
  version: string;
  stable: boolean;
  files: IVCVersionFile[];
}

export interface IVCVersionInfo {
  downloadUrl: string;
  resolvedVersion: string;
  fileName: string;
}

export async function getManifest(auth: string | undefined) {
  return getManifestFromRepo(
    'hhgyu',
    'virtualhere-client-versions',
    auth,
    'main'
  );
}

export async function getInfoFromManifest(
  versionSpec: string,
  stable: boolean,
  auth: string | undefined,
  arch = os.arch(),
  manifest?: IToolRelease[] | undefined
): Promise<IVCVersionInfo | null> {
  let info: IVCVersionInfo | null = null;
  if (!manifest) {
    core.debug('No manifest cached');
    manifest = await getManifest(auth);
  }

  core.info(`matching ${versionSpec}...`);

  const rel = await findFromManifest(versionSpec, stable, manifest, arch);

  if (rel && rel.files.length > 0) {
    info = <IVCVersionInfo>{};
    info.resolvedVersion = rel.version;
    info.downloadUrl = rel.files[0].download_url;
    info.fileName = rel.files[0].filename;
  }

  return info;
}

export async function getVC(
  versionSpec: string,
  stable: boolean,
  checkLatest: boolean,
  auth: string | undefined,
  arch = os.arch()
) {
  let manifest: IToolRelease[] | undefined;
  const osPlat: string = os.platform();

  if (stable) {
    manifest = await getManifest(auth);
    const stableVersion = await resolveStableVersionInput(
      stable,
      arch,
      osPlat,
      manifest
    );

    if (stableVersion) {
      core.info(`stable version resolved as ${stableVersion}`);

      versionSpec = stableVersion;
    }
  }

  if (checkLatest) {
    core.info('Attempting to resolve the latest version from the manifest...');
    const resolvedVersion = await resolveVersionFromManifest(
      versionSpec,
      true,
      auth,
      arch,
      manifest
    );

    if (resolvedVersion) {
      versionSpec = resolvedVersion;
      core.info(`Resolved as '${versionSpec}'`);
    } else {
      core.info(`Failed to resolve version ${versionSpec} from manifest`);
    }
  }

  // check cache
  const toolPath = find('virtualhere-client', versionSpec, arch);
  // If not found in cache, download
  if (toolPath) {
    core.info(`Found in cache @ ${toolPath}`);
    return toolPath;
  }
  core.info(`Attempting to download ${versionSpec}...`);
  let downloadPath = '';
  let info: IVCVersionInfo | null = null;

  //
  // Try download from internal distribution (popular versions only)
  //
  try {
    info = await getInfoFromManifest(versionSpec, true, auth, arch, manifest);
    if (info) {
      downloadPath = await installVCVersion(info, auth, arch);
    }
  } catch (err) {
    if (err instanceof Error) {
      if (
        err instanceof HTTPError &&
        (err.httpStatusCode === 403 || err.httpStatusCode === 429)
      ) {
        core.info(
          `Received HTTP status code ${err.httpStatusCode}.  This usually indicates the rate limit has been exceeded`
        );
      } else {
        core.info(err.message);
      }

      if (err.stack) {
        core.debug(err.stack);
      }

      core.info('Falling back to download directly from VirtualHere-Client');
    } else {
      core.info(`${err}: Unexpected Error`);
    }
  }

  if (!downloadPath) {
    throw new Error(
      `Unable to find Go version '${versionSpec}' for platform ${osPlat} and architecture ${arch}.`
    );
  }

  return downloadPath;
}

async function resolveVersionFromManifest(
  versionSpec: string,
  stable: boolean,
  auth: string | undefined,
  arch: string,
  manifest: IToolRelease[] | undefined
): Promise<string | undefined> {
  try {
    const info = await getInfoFromManifest(
      versionSpec,
      stable,
      auth,
      arch,
      manifest
    );
    return info?.resolvedVersion;
  } catch (err) {
    core.info('Unable to resolve a version from the manifest...');

    if (err instanceof Error) {
      core.debug(err.message);
    }
  }
}

export async function resolveStableVersionInput(
  stable: boolean,
  arch: string,
  platform: string,
  manifest: IToolRelease[]
) {
  const releases = manifest
    .map(item => {
      const index = item.files.findIndex(
        item => item.arch === arch && item.filename.includes(platform)
      );
      if (index === -1) {
        return '';
      }
      return item.version;
    })
    .filter(item => !!item && !prerelease(item));

  if (stable) {
    return releases[0];
  } else {
    const versions = releases.map(
      release => `${major(release)}.${minor(release)}`
    );
    const uniqueVersions = Array.from(new Set(versions));

    const oldstableVersion = releases.find(item =>
      item.startsWith(uniqueVersions[1])
    );

    return oldstableVersion;
  }
}

async function installVCVersion(
  info: IVCVersionInfo,
  auth: string | undefined,
  arch: string
): Promise<string> {
  core.info(`Acquiring ${info.resolvedVersion} from ${info.downloadUrl}`);

  // Windows requires that we keep the extension (.zip) for extraction
  const isWindows = os.platform() === 'win32';
  const tempDir = process.env.RUNNER_TEMP ?? '.';
  const fileName = isWindows ? path.join(tempDir, info.fileName) : undefined;

  const downloadPath = await downloadTool(info.downloadUrl, fileName, auth);

  core.info('Extracting VirtualHere-Client...');
  const extPath = await extractVCArchive(downloadPath);
  core.info(`Successfully extracted VirtualHere-Client to ${extPath}`);

  core.info('Adding to the cache ...');
  const toolCacheDir = await addExecutablesToToolCache(extPath, info, arch);
  core.info(`Successfully cached VirtualHere-Client to ${toolCacheDir}`);

  return toolCacheDir;
}

export async function extractVCArchive(archivePath: string): Promise<string> {
  const platform = os.platform();
  let extPath: string;

  if (platform === 'win32') {
    extPath = await extractZip(archivePath);
  } else {
    extPath = await extractTar(archivePath);
  }

  return extPath;
}

// for github hosted windows runner handle latency of OS drive
// by avoiding write operations to C:
async function cacheWindowsDir(
  extPath: string,
  tool: string,
  version: string,
  arch: string
): Promise<string | false> {
  if (os.platform() !== 'win32') return false;

  // make sure the action runs in the hosted environment
  if (
    process.env['RUNNER_ENVIRONMENT'] !== 'github-hosted' &&
    process.env['AGENT_ISSELFHOSTED'] === '1'
  )
    return false;

  const defaultToolCacheRoot = process.env['RUNNER_TOOL_CACHE'];
  if (!defaultToolCacheRoot) return false;

  if (!fs.existsSync('d:\\') || !fs.existsSync('c:\\')) return false;

  const actualToolCacheRoot = defaultToolCacheRoot
    .replace('C:', 'D:')
    .replace('c:', 'd:');
  // make toolcache root to be on drive d:
  process.env['RUNNER_TOOL_CACHE'] = actualToolCacheRoot;

  const actualToolCacheDir = await cacheDir(extPath, tool, version, arch);

  // create a link from c: to d:
  const defaultToolCacheDir = actualToolCacheDir.replace(
    actualToolCacheRoot,
    defaultToolCacheRoot
  );
  fs.mkdirSync(path.dirname(defaultToolCacheDir), {recursive: true});
  fs.symlinkSync(actualToolCacheDir, defaultToolCacheDir, 'junction');
  core.info(`Created link ${defaultToolCacheDir} => ${actualToolCacheDir}`);

  const actualToolCacheCompleteFile = `${actualToolCacheDir}.complete`;
  const defaultToolCacheCompleteFile = `${defaultToolCacheDir}.complete`;
  fs.symlinkSync(
    actualToolCacheCompleteFile,
    defaultToolCacheCompleteFile,
    'file'
  );
  core.info(
    `Created link ${defaultToolCacheCompleteFile} => ${actualToolCacheCompleteFile}`
  );

  // make outer code to continue using toolcache as if it were installed on c:
  // restore toolcache root to default drive c:
  process.env['RUNNER_TOOL_CACHE'] = defaultToolCacheRoot;
  return defaultToolCacheDir;
}

async function addExecutablesToToolCache(
  extPath: string,
  info: IVCVersionInfo,
  arch: string
): Promise<string> {
  const tool = 'virtualhere-client';
  const version = makeSemver(info.resolvedVersion);
  return (
    (await cacheWindowsDir(extPath, tool, version, arch)) ||
    (await cacheDir(extPath, tool, version, arch))
  );
}

export function makeSemver(version: string): string {
  version = version.replace('virtualhere-client', '');
  version = version.replace('beta', '-beta.').replace('rc', '-rc.');
  const parts = version.split('-');

  const semVersion = coerce(parts[0])?.version;
  if (!semVersion) {
    throw new Error(
      `The version: ${version} can't be changed to SemVer notation`
    );
  }

  if (!parts[1]) {
    return semVersion;
  }

  const fullVersion = valid(`${semVersion}-${parts[1]}`);

  if (!fullVersion) {
    throw new Error(
      `The version: ${version} can't be changed to SemVer notation`
    );
  }
  return fullVersion;
}
