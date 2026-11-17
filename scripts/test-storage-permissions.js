'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CodexProfiles } = require('../out/clients/codex/history/codexProfiles');
const { sharedPermissionPlan } = require('../out/clients/codex/history/sharedPermissions');
(async () => {
  if (process.platform !== 'linux' || process.getuid() !== 0) throw Error('This cross-UID fixture requires Linux root to launch an unprivileged synthetic worker.');
  const temp = await fs.mkdtemp(path.join(process.env.VSCODEMODELSWITCH_TEST_HOME || os.tmpdir(), 'shared-permissions-'));
  await fs.chown(temp, 0, 1000); await fs.chmod(temp, 0o2770);
  const root = path.join(temp, 'data/codex'), home = path.join(temp, 'container-home');
  // The folder picker supplies an existing user-selected parent. Do not model
  // an unrelated inaccessible ancestor as a plugin-created Codex directory.
  await fs.mkdir(path.dirname(root)); await fs.chmod(path.dirname(root), 0o2770);
  const uid = 1000, gid = 1000, previousUmask = process.umask(0o077);
  let count = 0; const test = async (name, fn) => { await fn(); count++; console.log('PASS ' + name); };
  const profiles = new CodexProfiles(root, home, 'container');
  await fs.mkdir(home); await fs.writeFile(path.join(home, 'config.toml'), 'model_provider = "OpenAI"\nmodel = "synthetic-api-model"\n');
  await fs.writeFile(path.join(home, 'auth.json'), '{"OPENAI_API_KEY":"synthetic-container-only"}');
  let id;
  await test('restrictive umask still produces group-accessible shared layout and registry during API enrollment', async () => {
    await profiles.initialize('api'); await profiles.assertAttached(); id=(await profiles.read()).activeId;
    for (const p of [root,path.join(root,'profiles'),path.join(root,'environments'),path.join(root,'.registry-recovery')]) assert.equal((await fs.stat(p)).mode & 0o7777, 0o2770);
    assert.equal((await fs.stat(path.join(root,'profiles.json'))).mode & 0o777, 0o660);
    assert.equal((await profiles.read()).identities[0].kind,'api');
    assert.match(await fs.readFile(path.join(home,'config.toml'),'utf8'),/synthetic-api-model/);
  });
  await test('host UID1000 can create its logs and attach existing API history without inheriting container credentials', async () => {
    const host = path.join(temp,'host');await fs.mkdir(host);await fs.chown(host,uid,gid);
    const history=profiles.home((await profiles.read()).identities[0]);
    // Native clients create new date directories/files later, outside AgentDeck.
    // Default ACLs must preserve group write without a second permission repair.
    await fs.mkdir(path.join(history,'sessions/new-day'),{mode:0o777});
    await fs.writeFile(path.join(history,'sessions/new-day/new-rollout.jsonl'),'synthetic-native-history');
    assert.equal((await fs.stat(path.join(history,'sessions/new-day/new-rollout.jsonl'))).mode&0o777,0o660);
    const modulePath = require.resolve('../out/clients/codex/history/codexProfiles');
    const worker = spawnSync(process.execPath,['-e', `
      const fs=require('node:fs/promises'),path=require('node:path');
      const {CodexProfiles}=require(process.argv[1]);
      (async()=>{const p=new CodexProfiles(process.argv[2],path.join(process.argv[3],'home'),'host');
      await p.createLayout();await fs.mkdir(path.join(p.environmentDirectory,'logs'),{recursive:true,mode:0o700});
      await p.attach(process.argv[4]);await p.assertAttached();
      await fs.appendFile(path.join(p.runtimeHome,'sessions/new-day/new-rollout.jsonl'),' synthetic-host-resume');
      try{await fs.readFile(path.join(p.runtimeHome,'auth.json'));throw Error('credential unexpectedly inherited');}catch(e){if(e.code!=='ENOENT')throw e;}
      const api=await p.add('same API','api');if(api.id!==process.argv[4])throw Error('duplicate API profile');
      await p.rename(api.id,'API renamed by host');console.log('HOST_API_ATTACH_OK');
      })().catch(e=>{console.error(e.message);process.exitCode=1;});
    `,modulePath,root,host,id],{uid,gid,encoding:'utf8',env:{PATH:path.dirname(process.execPath)+':/usr/bin:/bin'}});
    assert.equal(worker.status,0,worker.stderr);assert.match(worker.stdout,/HOST_API_ATTACH_OK/);
    assert.equal((await profiles.read()).identities[0].name,'API renamed by host');
    assert.equal((await fs.stat(path.join(root,'profiles.json'))).mode & 0o777,0o660);
    assert.equal((await fs.stat(path.join(root,'environments/host'))).mode & 0o077,0);
    assert.equal((await fs.stat(path.join(profiles.localHome((await profiles.read()).identities[0]),'auth.json'))).mode & 0o077,0);
  });
  await test('legacy permission repair plans never traverse environment credentials or symlinks', async () => {
    const privatePath=path.join(root,'environments/private');await fs.mkdir(privatePath,{mode:0o700});await fs.writeFile(path.join(privatePath,'auth.json'),'synthetic-private',{mode:0o600});
    const outside=path.join(temp,'outside');await fs.writeFile(outside,'synthetic-outside',{mode:0o600});await fs.symlink(outside,path.join(root,'profiles/external'));
    await fs.chmod(root,0o2700);await fs.chmod(path.join(root,'environments'),0o2700);await fs.chmod(path.join(root,'profiles.json'),0o600);
    assert.equal(spawnSync('setfacl',['-k',path.join(root,'profiles')]).status,0);
    const plan=await sharedPermissionPlan(root);assert.ok(plan.some(c=>c.path===path.join(root,'environments')));
    assert.ok(plan.some(c=>c.path===path.join(root,'profiles') && c.defaultAclBefore!==undefined));
    assert.ok(!plan.some(c=>c.path.startsWith(privatePath)||c.path===outside||c.path.endsWith('/external')));
    const snapshot=path.join(temp,'repair.json'), cli=path.join(__dirname,'repair-codex-storage-permissions.js');
    let result=spawnSync(process.execPath,[cli,root,snapshot,'--apply'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    assert.equal((await fs.stat(root)).mode&0o7777,0o2770);assert.equal((await fs.stat(outside)).mode&0o777,0o600);
    assert.equal((await fs.stat(privatePath)).mode&0o777,0o700);assert.equal((await fs.stat(path.join(privatePath,'auth.json'))).mode&0o777,0o600);
    result=spawnSync(process.execPath,[cli,root,snapshot,'--rollback'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    assert.equal((await fs.stat(root)).mode&0o7777,0o2700);assert.equal((await fs.stat(path.join(root,'profiles.json'))).mode&0o777,0o600);
    assert.equal(spawnSync('getfacl',['-c','-p','-d',path.join(root,'profiles')],{encoding:'utf8'}).stdout.trim(),'');
  });
  process.umask(previousUmask);
  console.log('RESULT: '+count+' cross-UID storage checks passed');console.log('RETAINED_FIXTURE: '+temp);
})().catch(error=>{console.error(error);process.exitCode=1;});
