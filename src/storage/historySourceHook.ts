import { recordApiHistorySource } from './historySources';

/** Native hook runner: bounded metadata input; no output added to chat context,
 * no request forwarding, auth reads, telemetry or native approval changes. */
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', data => { input += data; if (input.length > 64 * 1024) process.exit(1); });
  process.stdin.on('end', () => {
    void (async () => recordApiHistorySource(process.argv[2], JSON.parse(input)))().catch(() => {
      process.stderr.write('AgentDeck：新聊天API来源未能记录，请检查共享数据目录及来源记录设置。\n');
      process.exitCode = 1;
    });
  });
}
