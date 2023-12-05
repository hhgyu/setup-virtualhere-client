import os from 'node:os';
import {execSync, spawnSync} from 'node:child_process';

import * as core from '@actions/core';
import * as io from '@actions/io';

import * as installer from './installer';
import path from 'node:path';

const vsBin = 'virtualhere-client';

const startCommand = `&{
  $virtualhere = Get-Process ${vsBin} -ErrorAction SilentlyContinue
  if (!$virtualhere) {
    Write-Output 'vc-already=false'
    ${vsBin} -e -g
    sleep 1
  } else {
    Write-Output 'vc-already=true'
  }
}`;

export async function run() {
  const version = core.getInput('vc-version');

  let arch = core.getInput('architecture');

  // if architecture supplied but node-version is not
  // if we don't throw a warning, the already installed x64 node will be used which is not probably what user meant.
  if (arch && !version) {
    core.warning(
      '`architecture` is provided but `node-version` is missing. In this configuration, the version/architecture of Node will not be changed. To fix this, provide `architecture` in combination with `node-version`'
    );
  }

  if (!arch) {
    arch = os.arch();
  }

  if (version) {
    const token = core.getInput('token');
    const auth = !token ? undefined : `token ${token}`;
    const stable = (core.getInput('stable') || 'true').toUpperCase() === 'TRUE';
    const checkLatest =
      (core.getInput('check-latest') || 'false').toUpperCase() === 'TRUE';

    const installDir = await installer.getVC(
      version,
      stable,
      checkLatest,
      auth,
      arch
    );

    core.addPath(installDir);
    core.info('Added VirtualHere-Client to the path');

    core.info(`Successfully set up VirtualHere-Client version ${version}`);
  } else {
    core.info(
      '[warning]vc-version input was not specified. The action will try to use pre-installed version.'
    );
  }

  const added = await addBinToPath();
  core.debug(`add bin ${added}`);

  const vcPath = await io.which('virtualhere-client');

  if (os.platform() == 'win32') {
    const p = spawnSync(
      'pwsh',
      [
        '-NoProfile',
        '-Command',
        `&{ Write-Output ([System.Diagnostics.FileVersionInfo]::GetVersionInfo("${vcPath}").FileVersion) }`
      ],
      {encoding: 'utf8'}
    );
    if (p.error) {
      throw p.error;
    } else if (p.status != 0) {
      throw new Error(`exitCode not zero ${p.status}`);
    } else if (p.output[2] != '') {
      throw new Error(`stderr : ${p.output[2]}`);
    }

    core.setOutput('vc-version', p.output[1]?.trim());
  } else {
    const vcVersion = execSync(`${vcPath} -h`)?.toString() ?? '';

    core.setOutput('vc-version', parseVCVersion(vcVersion));
  }

  const scriptsPath = path.normalize(
    path.join(__dirname, '..', '..', 'scripts')
  );
  process.env['PATH'] = `${scriptsPath}:${process.env['PATH']}`;
  core.debug(`Append Env Path: ${process.env['PATH']}`);
  core.addPath(scriptsPath);

  {
    const p = spawnSync('pwsh', ['-NoProfile', '-Command', startCommand], {
      encoding: 'utf8',
      env: process.env
    });
    if (p.error) {
      throw p.error;
    } else if (p.status != 0) {
      throw new Error(`exitCode not zero ${p.status}`);
    } else if (p.output[2] != '') {
      throw new Error(`stderr : ${p.output[2]}`);
    }

    core.info('Successfully Start up VirtualHere-Client');
  }
}

export async function addBinToPath(): Promise<boolean> {
  const vc = await io.which('virtualhere-client');
  core.debug(`which VirtualHere-Client :${vc}:`);
  if (!vc) {
    core.debug('VirtualHere-Client not in the path');
    return false;
  }

  const vcPath = path.dirname(vc);
  process.env['PATH'] = `${vcPath}:${process.env['PATH']}`;
  core.debug(`Append Env Path: ${process.env['PATH']}`);
  core.addPath(vcPath);
  return true;
}

export function parseVCVersion(versionString: string): string {
  let versinMatch = /^VirtualHere Client \(v(?<Version>\d+\.\d+\.\d+)\)/m.exec(
    versionString
  );
  if (versinMatch?.groups && Object.hasOwn(versinMatch.groups, 'Version')) {
    return versinMatch.groups['Version'];
  }

  versinMatch = /^VirtualHere Client (?<Version>\d+\.\d+\.\d+)/m.exec(
    versionString
  );
  if (versinMatch?.groups && Object.hasOwn(versinMatch.groups, 'Version')) {
    return versinMatch.groups['Version'];
  }

  throw new Error('Not Found VirtualHere-Client');
}
