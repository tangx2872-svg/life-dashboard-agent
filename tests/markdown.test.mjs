import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// public/markdown.js is a classic script (no modules); evaluate it in an isolated scope.
const source=readFileSync(new URL('../public/markdown.js',import.meta.url),'utf8');
const {renderMarkdown,renderWeeklyPlan}=new Function(source+'\nreturn {renderMarkdown,renderWeeklyPlan};')();

const WEEKLY=`以下按当前时间 **2026年10月30日（周五）14:21，Asia/Shanghai**，概括未来7天安排。

## 未来7天安排

| 日期 | 主要安排 |
|---|---|
| **10月31日 周六** | 更新简历；可处理零散事务。 |
| **11月1日 周日** | 背 80 个六级词汇；完善 Life 语音输入；整理 GitHub 主页 |
| **11月2日 周一** | 修改论文第三章 |

> 假设：课程作业截止时间为下周一，如果不同可以调整。
`;

test('Markdown: headings, bold, lists and paragraphs render without raw symbols',()=>{
  const html=renderMarkdown('## 本周总结\n\n**完成事项**\n\n- 修改论文\n- 完成课程实验');
  assert.match(html,/<h2>本周总结<\/h2>/);
  assert.match(html,/<strong>完成事项<\/strong>/);
  assert.equal((html.match(/<li>/g)||[]).length,2);
  assert.ok(!html.includes('##')&&!html.includes('**'));
});

test('Markdown: ordered lists, quotes, inline code, links and fences',()=>{
  const html=renderMarkdown('1. 第一步\n2. 第二步\n\n> 提醒一句\n\n用 `pnpm test` 校验，参考 [文档](https://example.com)。\n\n```\nconst a=1;\n```');
  assert.match(html,/<ol><li>第一步<\/li><li>第二步<\/li><\/ol>/);
  assert.match(html,/<blockquote><p>提醒一句<\/p><\/blockquote>/);
  assert.match(html,/<code>pnpm test<\/code>/);
  assert.match(html,/<a href="https:\/\/example.com"/);
  assert.match(html,/<pre><code>const a=1;<\/code><\/pre>/);
});

test('Markdown: tables become real tables, never pipe separators',()=>{
  const html=renderMarkdown('| 日期 | 主要安排 |\n|---|---|\n| 10月31日 | 更新简历 |');
  assert.match(html,/<table>/);
  assert.match(html,/<th>日期<\/th>/);
  assert.match(html,/<td data-label="日期">10月31日<\/td>/);
  assert.ok(!html.includes('|---|')&&!html.includes('| 日期 |'));
});

test('Markdown: model output is escaped and unsafe links are dropped',()=>{
  const html=renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[点我](javascript:alert(1))\n\n[正常](https://example.com/a?b=1&c=2)');
  assert.ok(!html.includes('<script')&&!html.includes('<img'),'raw HTML never becomes markup');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/javascript:/i.test(html));
  assert.match(html,/<a href="https:\/\/example.com\/a\?b=1&amp;c=2"/);
});

test('Weekly review: markdown table becomes dated day cards without technical meta',()=>{
  const plan=renderWeeklyPlan(WEEKLY);
  assert.equal(plan.structured,true);
  const html=plan.html;
  assert.ok(!html.includes('<table'),'weekly plan is not a wide table');
  assert.equal((html.match(/class="week-plan-day"/g)||[]).length,3);
  assert.match(html,/10 月 31 日/);
  assert.match(html,/<span>周六<\/span>/);
  assert.match(html,/11 月 2 日 — |10 月 31 日 — 11 月 2 日/);
  assert.match(html,/<li>更新简历<\/li>/);
  assert.equal((html.match(/<li>背 80 个六级词汇<\/li>/g)||[]).length,1);
  assert.ok(!/Asia\/|Shanghai|2026年10月30日/.test(html),'timezone and clock details stay out of the UI');
  assert.ok(!html.includes('|'),'no leftover pipe characters');
  assert.match(html,/假设：课程作业截止时间/, 'notes after the table are kept');
});

test('Weekly review: non tabular content falls back to plain markdown',()=>{
  const plan=renderWeeklyPlan('## 未来一周\n\n下周先推进论文，再补六级词汇。');
  assert.equal(plan.structured,false);
  assert.equal(plan.html,'');
  const html=renderMarkdown('## 未来一周\n\n下周先推进论文，再补六级词汇。');
  assert.match(html,/<h2>未来一周<\/h2>/);
});
