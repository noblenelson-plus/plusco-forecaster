// scripts/check-deploy-source.mjs
//
// Hosting predeploy guard (firebase.json): refuses to deploy anything but the
// latest master. 2026-11-19: a deploy from a checkout still on the Nov 3
// master put a 2-week-old build live (Milestones and every later change
// disappeared). Deploy from a checkout of origin/master:
//
//   git fetch; git checkout --detach origin/master
//
// Emergency override (e.g. a hotfix branch, on purpose): DEPLOY_ANY_COMMIT=1.

import { execSync } from "node:child_process";

const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();

if (process.env.DEPLOY_ANY_COMMIT === "1") {
  console.log("Deploy source check skipped (DEPLOY_ANY_COMMIT=1).");
  process.exit(0);
}

try {
  git("fetch --quiet origin master");
} catch {
  console.error("\nDeploy stopped: could not fetch origin/master to check this checkout is up to date.\n");
  process.exit(1);
}

const head = git("rev-parse HEAD");
const master = git("rev-parse origin/master");
const short = (sha) => sha.slice(0, 7);

if (head !== master) {
  console.error(
    `\nDeploy stopped: this checkout is at ${short(head)} (${git("log -1 --format=%cs HEAD")}), ` +
      `not the latest master ${short(master)}.\n` +
      `Run: git fetch; git checkout --detach origin/master — then deploy again.\n`
  );
  process.exit(1);
}

// Local edits to tracked files would ship too.
const dirty = git("status --porcelain --untracked-files=no");
if (dirty) {
  console.error(`\nDeploy stopped: this checkout has uncommitted changes:\n${dirty}\n`);
  process.exit(1);
}

console.log(`Deploy source OK (latest master ${short(master)}).`);
