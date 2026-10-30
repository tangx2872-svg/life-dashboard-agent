// Third correctness layer: replay every proposal through the real applyLifeActions.
// usage: node validate-apply.mjs [outDir]
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {applyLifeActions} from '../../server/life-proposals.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] || path.join(here, 'out'));
if (!existsSync(path.join(outDir, 'results.jsonl'))) {
  console.error('missing results.jsonl in ' + outDir + ' — run run-benchmark.py first');
  process.exit(1);
}
const contexts = JSON.parse(readFileSync(path.join(outDir, 'contexts.json'), 'utf8'));
const rows = readFileSync(path.join(outDir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const checked = rows.map(record => {
  if (!record.proposal) return {request_index: record.request_index, apply_actions_valid: false, apply_error: 'no proposal'};
  try {
    applyLifeActions(contexts.state.data, record.proposal.operations || []);
    return {request_index: record.request_index, apply_actions_valid: true, apply_error: ''};
  } catch (error) {
    return {request_index: record.request_index, apply_actions_valid: false, apply_error: String(error.message || error).slice(0, 160)};
  }
});
writeFileSync(path.join(outDir, 'apply.jsonl'), checked.map(row => JSON.stringify(row)).join('\n') + '\n');
console.log(JSON.stringify({records: checked.length, valid: checked.filter(row => row.apply_actions_valid).length}));
