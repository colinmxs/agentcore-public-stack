# Task: Implement AWS CDK Infrastructure and CI/CD

## Project Context
You are implementing a 5-stack AWS CDK application with platform-agnostic CI/CD pipelines. All build/test/deploy logic must reside in portable shell scripts, with GitHub Actions serving only as an orchestration layer.

## Context Files
1. **THE_PLAN.md**: Your implementation checklist with all tasks
2. **CLAUDES_INSTRUCTIONS.md**: Your operational constraints and quality standards
3. **CLAUDES_LESSONS_PHASE*.md**: Lessons learned and best practices from completed phases

## Instructions
1. Open and read `THE_PLAN.md` to understand all pending tasks
2. Read `CLAUDES_INSTRUCTIONS.md` to understand constraints and rules
3. Review relevant `CLAUDES_LESSONS_PHASE*.md` files to avoid repeating past mistakes
4. Identify the next unchecked task in `THE_PLAN.md`
5. Complete the task fully (write code, create files, test, etc.)
6. Verify your work meets the quality standards
7. Update `THE_PLAN.md` to mark the task as complete (`- [x]`)
8. Repeat steps 4-7 until you reach a `[HUMAN]` checkpoint at the end of a phase
9. **STOP** when you reach a `[HUMAN]` checkpoint and wait for human approval before continuing

## Phase Boundaries & Human Approval
- At the end of each phase in `THE_PLAN.md`, there is a special `[HUMAN]` checkbox (e.g., `- [ ] [HUMAN] Phase 0 verified and approved to proceed to Phase 1`).
- You must **STOP** when you reach a `[HUMAN]` checkpoint. Do NOT check these boxes yourself.
- Only a human can check `[HUMAN]` boxes after manual inspection and verification.
- You may only proceed to the next phase after the human has checked the `[HUMAN]` box for the previous phase.
- Summarize your completed work and files created when you reach a `[HUMAN]` checkpoint.

## Critical Rules
- Follow ALL constraints in `CLAUDES_INSTRUCTIONS.md`
- Apply lessons learned from `CLAUDES_LESSONS_PHASE*.md` documents
- Complete tasks sequentially - do not skip ahead
- Do not batch task completions - mark each task complete immediately after finishing it
- Verify your work before marking tasks complete
- Never hardcode AWS Account IDs, Regions, or resource names
- GitHub Actions workflows must ONLY call shell scripts (no inline logic)
- Do not create new Markdown documentation files unless explicitly requested
- **STOP at Phase Boundaries**: When you complete all tasks in a phase and encounter a `[HUMAN]` checkpoint, STOP and summarize what was completed. Do NOT check the `[HUMAN]` checkbox - only humans can approve phases.
- **Phase Boundaries are Mandatory**: You cannot proceed to the next phase until the human has checked the `[HUMAN]` approval checkbox.

## Success Criteria
- All checkboxes in `THE_PLAN.md` are marked complete (`- [x]`)
- All `[HUMAN]` checkboxes are checked by a human after manual inspection
- All CDK stacks deploy successfully
- All shell scripts are portable and work on ubuntu-latest
- All GitHub Actions workflows trigger correctly based on path changes
- All configuration is externalized and environment-agnostic

Begin by reading `THE_PLAN.md` and starting with the first pending task in Phase 0. Work until you reach the first `[HUMAN]` checkpoint, then stop and wait for human approval before continuing.
