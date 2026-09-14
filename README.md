# HeartCalm

A lightweight web app for **calming support, palpitation episode logging, breathing guidance and safer escalation prompts**.

Live app: <https://heart-calm-vert.vercel.app>

> **Not a diagnostic tool or medical device.** HeartCalm does not interpret ECGs or heart rhythms, diagnose arrhythmias, declare an episode benign/safe, or replace urgent medical assessment.

## What it is for

- a guided “palpitations now” flow;
- red-flag and same-day escalation prompts;
- episode timing and structured symptom/context logging;
- gentle breathing/relaxation support;
- trends and GP-ready summaries;
- anti-spiral/repeated-checking guardrails;
- privacy-conscious local data controls.

See [`docs/upgrade-ideas.md`](docs/upgrade-ideas.md) for the detailed implementation history and safety design.

## Related health apps

HeartCalm is one part of a broader health toolkit:

- **Health Reference / ColdFluApp** — evidence, first aid, family health, medicines, learning resources and quizzes: <https://github.com/joshualparris/ColdFluApp>
- **HealthLens** — private analysis of wearable exports, pathology reports and health data: <https://github.com/joshualparris/HealthLens> · <https://health-lens-rust.vercel.app>

The boundary is intentional: HeartCalm helps during/after an episode; Health Reference explains reviewed health evidence; HealthLens handles private personal data. Cross-linking does not imply automatic transfer of health information.

## Learning-media rule

Educational podcasts or videos may be offered only in calm/learning areas. They must **not** distract from an active palpitation, red-flag check, emergency guidance or help-now flow. See [`podcasttodo.md`](podcasttodo.md).

## Development

This is a small PWA built with HTML/CSS/JavaScript, a service worker and a Node test suite. The repository also contains browser/E2E testing and deployment configuration.

```bash
npm install
npm test
```

For current behavioural and safety details, read the implementation notes in [`docs/upgrade-ideas.md`](docs/upgrade-ideas.md).
