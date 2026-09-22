<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# Post-Integration Branch and Worktree Cleanup

Verification and cleanup are separate outcomes. Cancellation stops owned workers and preserves dirty
or unmerged work — cancellation is **not** cleanup authorization. Never remove a worktree, branch or
runtime session based on a guessed naming pattern.

Every flow that creates a branch or a managed worktree records `base_branch`, `source_branch`,
`source_commit`, `worktree_path`, `worktree_owner` and `cleanup_state` in `flow:{task_id}`. Resolve
the base branch as `main`, falling back to `master`, and record the actual name.

**Cleanup is a required close gate, not optional housekeeping.**

1. Do not clean before the source commit exists, the verification and review gates pass, and the
   source commit is an ancestor of the actual base branch
   (`git merge-base --is-ancestor <source_commit> <base_branch>`).
2. Verify the base worktree is clean and the source worktree has no uncommitted or untracked files.
   If either is dirty, set `cleanup_state: blocked_dirty` and keep the branch and worktree. **Never**
   use `git worktree remove --force` to hide changes.
3. The orchestrator stops the managed session and any run process before cleanup. **Builders never
   remove their own worktree.**
4. Remove only worktrees owned by this flow and located under the repository's managed worktree
   directory (for example `.kilo/worktrees/`, `.worktrees/` or `worktrees/`). The path alone is
   insufficient: `worktree_owner` and flow registration must prove ownership. Never remove the main
   worktree, an external or harness-owned worktree, or one of unknown provenance.
5. From the main repository, remove the verified worktree, run `git worktree prune`, then delete the
   now-unreferenced local source branch with `git branch -d <source_branch>`.
6. If a stale registration has no directory, run `git worktree prune` first, then delete the source
   branch only after the ancestry check still passes.
7. **Managed session cleanup**: for each managed session recorded in
   `flow:{task_id}.agent_manager_sessions`, stop it by session ID. After all sessions are stopped,
   list sessions and verify no stale worktree entries remain ungrouped. If stale entries persist
   (directory already removed but the UI entry remains), use the harness's supported API to clear the
   registration, or record `cleanup_state: am_stale_ui` for manual review. Do not create dummy
   sessions to work around stale UI entries where the harness offers a supported call.
8. Record `cleanup_state: complete`, the removed paths, branch, commit, the session IDs stopped and
   the command exit statuses in `cleanup:{task_id}` and in the final session drawer. **A flow is not
   complete while `cleanup_state` is pending or blocked.**

**Remote branches are not deleted implicitly.** Delete a remote branch only when the flow explicitly
owns it, no active PR depends on it, and the user or task contract authorizes remote deletion;
otherwise record the remote branch as externally owned.

A denied cleanup is not permission to retry with broader access. Preserve user edits, unrelated
branches and unmerged work in every case.

## Uninstall

Uninstall uses the installation manifest and removes only unchanged installer-owned files or exact
owned spans. **Files the user edited are preserved and reported**, never overwritten or deleted. Do
not remove project package managers, user tools, credentials or provider configuration.
