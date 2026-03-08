"""Extended users repository + files repository tests for deeper coverage."""

import pytest


class TestUserRepositoryExtended:
    @pytest.fixture(autouse=True)
    def _setup(self, user_repository):
        self.repo = user_repository

    def _make_profile(self, user_id="u1", email="alice@test.com", **kw):
        from apis.shared.users.models import UserProfile
        defaults = dict(
            user_id=user_id, email=email, name="Alice",
            roles=["viewer"], email_domain="test.com",
            created_at="2026-01-01T00:00:00Z", last_login_at="2026-01-01T00:00:00Z",
        )
        defaults.update(kw)
        return UserProfile(**defaults)

    @pytest.mark.asyncio
    async def test_create_and_get(self):
        p = await self.repo.create_user(self._make_profile())
        got = await self.repo.get_user("u1")
        assert got is not None
        assert got.email == "alice@test.com"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self):
        assert await self.repo.get_user("nope") is None

    @pytest.mark.asyncio
    async def test_get_by_user_id(self):
        await self.repo.create_user(self._make_profile())
        got = await self.repo.get_user_by_user_id("u1")
        assert got is not None

    @pytest.mark.asyncio
    async def test_get_by_email(self):
        await self.repo.create_user(self._make_profile())
        got = await self.repo.get_user_by_email("alice@test.com")
        assert got is not None

    @pytest.mark.asyncio
    async def test_get_by_email_case_insensitive(self):
        await self.repo.create_user(self._make_profile())
        got = await self.repo.get_user_by_email("ALICE@TEST.COM")
        assert got is not None

    @pytest.mark.asyncio
    async def test_update_user(self):
        p = self._make_profile()
        await self.repo.create_user(p)
        p.name = "Alice Updated"
        await self.repo.update_user(p)
        got = await self.repo.get_user("u1")
        assert got.name == "Alice Updated"

    @pytest.mark.asyncio
    async def test_upsert_new(self):
        p, is_new = await self.repo.upsert_user(self._make_profile())
        assert is_new is True

    @pytest.mark.asyncio
    async def test_upsert_existing(self):
        await self.repo.create_user(self._make_profile())
        p, is_new = await self.repo.upsert_user(self._make_profile(name="Updated"))
        assert is_new is False

    @pytest.mark.asyncio
    async def test_create_duplicate_raises(self):
        await self.repo.create_user(self._make_profile())
        with pytest.raises(ValueError, match="already exists"):
            await self.repo.create_user(self._make_profile())

    @pytest.mark.asyncio
    async def test_list_by_domain(self):
        await self.repo.create_user(self._make_profile("u1", "a@test.com"))
        await self.repo.create_user(self._make_profile("u2", "b@test.com"))
        items, _ = await self.repo.list_users_by_domain("test.com")
        assert len(items) == 2

    @pytest.mark.asyncio
    async def test_list_by_status(self):
        await self.repo.create_user(self._make_profile("u1", "a@test.com", status="active"))
        items, _ = await self.repo.list_users_by_status("active")
        assert len(items) >= 1

    @pytest.mark.asyncio
    async def test_disabled_repo(self, monkeypatch):
        monkeypatch.delenv("DYNAMODB_USERS_TABLE_NAME", raising=False)
        from apis.shared.users.repository import UserRepository
        repo = UserRepository(table_name="")
        assert repo.enabled is False
        assert await repo.get_user("x") is None
        assert await repo.get_user_by_user_id("x") is None
        assert await repo.get_user_by_email("x@y.com") is None
        items, _ = await repo.list_users_by_domain("x.com")
        assert items == []
        items, _ = await repo.list_users_by_status("active")
        assert items == []
        p, is_new = await repo.upsert_user(self._make_profile())
        assert is_new is False


class TestFileRepositoryExtended:
    @pytest.fixture(autouse=True)
    def _setup(self, file_repository):
        self.repo = file_repository

    def _make_file(self, upload_id="f1", user_id="u1", session_id="s1", **kw):
        from apis.shared.files.models import FileMetadata, FileStatus
        defaults = dict(
            upload_id=upload_id, user_id=user_id, session_id=session_id,
            filename="test.txt", mime_type="text/plain", size_bytes=100,
            s3_bucket="test-bucket", s3_key=f"uploads/{upload_id}",
            status=FileStatus.READY,
        )
        defaults.update(kw)
        return FileMetadata(**defaults)

    @pytest.mark.asyncio
    async def test_create_and_get(self):
        f = await self.repo.create_file(self._make_file())
        got = await self.repo.get_file("u1", "f1")
        assert got is not None
        assert got.filename == "test.txt"

    @pytest.mark.asyncio
    async def test_create_duplicate_raises(self):
        await self.repo.create_file(self._make_file())
        with pytest.raises(ValueError, match="already exists"):
            await self.repo.create_file(self._make_file())

    @pytest.mark.asyncio
    async def test_update_status(self):
        from apis.shared.files.models import FileStatus
        await self.repo.create_file(self._make_file())
        updated = await self.repo.update_file_status("u1", "f1", FileStatus.FAILED)
        assert updated is not None

    @pytest.mark.asyncio
    async def test_update_status_nonexistent(self):
        from apis.shared.files.models import FileStatus
        assert await self.repo.update_file_status("u1", "nope", FileStatus.FAILED) is None

    @pytest.mark.asyncio
    async def test_delete_file(self):
        await self.repo.create_file(self._make_file())
        deleted = await self.repo.delete_file("u1", "f1")
        assert deleted is not None
        assert await self.repo.get_file("u1", "f1") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self):
        assert await self.repo.delete_file("u1", "nope") is None

    @pytest.mark.asyncio
    async def test_list_user_files(self):
        for i in range(3):
            await self.repo.create_file(self._make_file(upload_id=f"f{i}"))
        files, cursor = await self.repo.list_user_files("u1")
        assert len(files) == 3

    @pytest.mark.asyncio
    async def test_list_user_files_pagination(self):
        for i in range(5):
            await self.repo.create_file(self._make_file(upload_id=f"f{i}"))
        files, cursor = await self.repo.list_user_files("u1", limit=2)
        assert len(files) == 2
        assert cursor is not None

    @pytest.mark.asyncio
    async def test_list_session_files(self):
        await self.repo.create_file(self._make_file("f1", session_id="s1"))
        await self.repo.create_file(self._make_file("f2", session_id="s1"))
        files = await self.repo.list_session_files("s1")
        assert len(files) == 2

    @pytest.mark.asyncio
    async def test_delete_session_files(self):
        await self.repo.create_file(self._make_file("f1", session_id="s1"))
        await self.repo.create_file(self._make_file("f2", session_id="s1"))
        deleted = await self.repo.delete_session_files("s1")
        assert len(deleted) == 2

    @pytest.mark.asyncio
    async def test_delete_session_files_empty(self):
        deleted = await self.repo.delete_session_files("empty-session")
        assert deleted == []

    @pytest.mark.asyncio
    async def test_quota_operations(self):
        quota = await self.repo.get_user_quota("u1")
        assert quota.total_bytes == 0
        q1 = await self.repo.increment_quota("u1", 1000)
        assert q1.total_bytes == 1000
        q2 = await self.repo.decrement_quota("u1", 500)
        assert q2.total_bytes == 500
