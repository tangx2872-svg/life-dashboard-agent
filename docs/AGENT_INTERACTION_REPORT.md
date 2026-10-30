# Today interaction verification — 2026-10-30

## Flow
idle → listening → transcribing → understanding / planning → clarifying or proposal_ready → applying → done; failures → error.
The compatibility adapter maps understanding/planning to existing thinking and proposal_ready to review, preserving the existing voice and confirmation handlers. No fabricated model progress is shown.

Voice transcription now automatically starts planning. Original transcription remains editable. Editing marks the request dirty; stale replies are ignored, resubmission aborts the earlier request. Typed input submits by button or Ctrl/Cmd+Enter; Enter inserts a newline.

## Clarification contract
```json
{
  "intent": "needs_clarification",
  "understanding": "春节四川旅行",
  "questions": [{
    "id": "duration",
    "question": "准备玩几天？",
    "type": "single_choice",
    "options": [{"label": "5 天", "value": "5"}],
    "allowCustom": true
  }],
  "operations": [],
  "adjustments": []
}
```
Example shows one option for brevity; model instructions request 2–5 options and at most 3 high-impact questions. Server validates question/option bounds and structure. Enough context uses defaults and no questions. Current project/task and scoped Life context remain supplied.

Selections remain local; Continue sends all answers in one request using the existing proposal ID. Custom answers are supported. Plans show first four steps, with remaining steps expandable. Confirm remains the only write entry, with existing revision checks and Undo. Edit and model-generated adjustment chips revise the same proposal.

## Layout
Input, questions and plan use separate blocks. Microphone and submit use a normal action row rather than overlay positioning. Input height is bounded, options wrap, long plan titles wrap, mobile hides shortcut hints. No sidebar, logo or theme redesign.

## Validation
- Actual Chrome browser: 7 tests passed, 0 failed. Covers automatic voice → batched clarification → proposal → adjustment → confirmation, same proposal identity, edit/request races, text submission and multiline shortcut, current-project/global context, Undo, navigation and 390px viewport.
- Browser model/ASR responses are deterministic injected fixtures, not a claim of a physical microphone recording with the live provider.
- Actual configured autodl-compatible model: 四川春节旅行 prompt returned 3 structured questions, 0 operations; first token 2533 ms, total 5857 ms. This separately verifies the live structured model contract.
- Node suite: 30 passed, 17 browser tests skipped without BROWSER_MODULE, 0 failures. Seven relevant browser tests were separately enabled and passed.
- Python suite: 83 passed.
- Build: passed 94 JavaScript syntax / asset-reference checks; .local/build/public generated.
- No database migration, authentication/session changes or automatic data writes introduced. No push requested for this round.

Final local live Chrome smoke: new guest at 390px, real API and configured model returned 3 questions with no error; document width = viewport width = 390. Screenshot inspection found the old floating microphone overlapping a custom-answer field; the duplicate floating entry is now hidden only while the homepage composer is present.
