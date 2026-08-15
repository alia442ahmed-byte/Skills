-- Budget data is never readable before sign-in: drop anon's privileges entirely,
-- so the tables are not even discoverable with the publishable key.
revoke all on public.budget_settings     from anon;
revoke all on public.budget_categories   from anon;
revoke all on public.budget_transactions from anon;
revoke all on public.budget_goals        from anon;
revoke all on public.budget_recurring    from anon;
