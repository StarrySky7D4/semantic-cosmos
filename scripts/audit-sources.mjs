import fs from 'node:fs';
const audit=JSON.parse(fs.readFileSync('public/data/source-audit.json'));
audit.partial=[{url:'https://x.com/elonmusk/status/2098462085973741960',status:'official-search-excerpt',usedIn:'2026-09-11-grok47-early-stop',limitation:'官方账号索引摘要可读，正文无法完整获取；RL 根因仍为原作者猜测。'},{url:'https://x.com/Alibaba_Qwen/status/2094968708288680276',status:'official-search-excerpt',usedIn:'2026-09-02-qwen38-max',limitation:'仅采用官方索引简介，不扩写性能、价格。'},{url:'https://x.com/OpenAI/status/2103566736356458911',status:'official-search-excerpt',usedIn:'2026-07-08-openai-hf-incident',limitation:'同一事件以官方完整报告和 METR 为主要来源，不新增一条重复事件。'},{url:'https://qwen.ai/blog?id=qwen3.7',status:'official-search-excerpt',usedIn:'2026-05-19-qwen37',limitation:'公告日期及简介来自官方索引；浏览器正文未呈现。'}];
audit.unresolved=[{url:'https://x.com/deepseek_ai/status/2097930608790167907',reason:'X 正文不可读；相同架构发布以完整模型卡及官方更新日志验证，不增加重复记录。'}];
audit.datePolicy='event_date 与 published_date 分开；未知为 null，月份精度保留 YYYY-MM。持续更新报告逐来源记录日期，不猜发布日期。';
fs.writeFileSync('public/data/source-audit.json',JSON.stringify(audit,null,2)+'\n');
