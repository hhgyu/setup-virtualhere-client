import * as core from '@actions/core';
import {spawnSync} from 'node:child_process';

// Catch and log any unhandled exceptions.  These exceptions can leak out of the uploadChunk method in
// @actions/toolkit when a failed upload closes the file descriptor causing any in-process reads to
// throw an uncaught exception.  Instead of failing this action, just warn.
process.on('uncaughtException', e => {
  core.info(`[warning]${e.message}`);
});

const vsBin = 'virtualhere-client';

const stopCommand = `&{
    $virtualhere = Get-Process ${vsBin} -ErrorAction SilentlyContinue
    if ($virtualhere) {
        $virtualhere.CloseMainWindow()
        sleep 1
        if (!$virtualhere.HasExited) {
            $virtualhere | Stop-Process -Force
        }
    }
}`;

export async function run() {
  try {
    const shutdown = core.getBooleanInput('shutdown');

    if (!shutdown) {
      return;
    }

    {
      const p = spawnSync('pwsh', ['-NoProfile', '-Command', stopCommand], {
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

      core.info('Successfully stoped VirtualHere-Client');
    }
  } catch (error) {
    let message = 'Unknown error!';
    if (error instanceof Error) {
      message = error.message;
    }
    if (typeof error === 'string') {
      message = error;
    }
    core.warning(message);
  }
}

run();
