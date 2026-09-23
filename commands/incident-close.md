---
description: "Close an incident once verification evidence is recorded"
---
<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->

Load and follow the `orchestrate-core` skill (or, in a project install, the bridge `.agents/skills/orchestrate/SKILL.md`) before handling this request.
Mode: incident-close
Arguments: $ARGUMENTS

Close the incident only after verification evidence is recorded. Do not skip post-incident cleanup and the closing summary.
