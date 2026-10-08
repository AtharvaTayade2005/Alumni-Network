"""
Pytest Test Suite for Student & Alumni Authentication and Registration.
Topic: Alumni Network Portal - Validation of Login & Registration

To run:
    pytest tests/python/test_auth_pytest.py -v
"""

import pytest
import sys
from pathlib import Path

# Ensure module path is accessible
sys.path.insert(0, str(Path(__file__).parent))

from auth_service import (
    AuthService,
    ValidationError,
    AuthenticationError,
    DuplicateUserError,
    AccountSuspendedError,
)


@pytest.fixture
def auth_service():
    """Provides a fresh, isolated instance of AuthService for each test."""
    service = AuthService()
    return service


@pytest.fixture
def sample_student_payload():
    """Provides standard valid payload for student registration."""
    return {
        "email": "student.john@university.edu",
        "password": "SecurePassword123!",
        "firstName": "John",
        "lastName": "Doe",
        "role": "STUDENT",
        "yearOfStudy": 3,
        "studentIdNumber": "STU-2024-9871",
        "department": "Computer Science",
        "acceptTerms": True,
    }


@pytest.fixture
def sample_alumni_payload():
    """Provides standard valid payload for alumni registration."""
    return {
        "email": "alumni.jane@alumni.org",
        "password": "GraduatedPass2020#",
        "firstName": "Jane",
        "lastName": "Smith",
        "role": "ALUMNI",
        "graduationYear": 2020,
        "department": "Mechanical Engineering",
        "acceptTerms": True,
    }


# ============================================================================
# REGISTRATION TEST CASES
# ============================================================================

class TestRegistration:
    """Test group for user registration functionality."""

    def test_tc_reg_01_student_registration_success(self, auth_service, sample_student_payload):
        """TC-REG-01: Verify successful registration for a Student with valid data."""
        result = auth_service.register(sample_student_payload)

        assert result["email"] == "student.john@university.edu"
        assert result["firstName"] == "John"
        assert result["lastName"] == "Doe"
        assert result["role"] == "STUDENT"
        assert result["accountStatus"] == "ACTIVE"
        assert "id" in result

    def test_tc_reg_02_alumni_registration_success(self, auth_service, sample_alumni_payload):
        """TC-REG-02: Verify successful registration for an Alumni with graduation year."""
        result = auth_service.register(sample_alumni_payload)

        assert result["email"] == "alumni.jane@alumni.org"
        assert result["role"] == "ALUMNI"
        assert result["accountStatus"] == "ACTIVE"

    @pytest.mark.parametrize(
        "invalid_email",
        [
            "plainaddress",
            "@missingusername.com",
            "username@.com",
            "username@com",
            "",
            "   ",
        ],
    )
    def test_tc_reg_03_registration_fails_with_invalid_email(
        self, auth_service, sample_student_payload, invalid_email
    ):
        """TC-REG-03: Verify registration rejection on invalid email formats."""
        sample_student_payload["email"] = invalid_email

        with pytest.raises(ValidationError) as exc_info:
            auth_service.register(sample_student_payload)

        assert "email" in str(exc_info.value).lower()

    @pytest.mark.parametrize(
        "weak_password, reason",
        [
            ("Short1!", "Password must be at least 10 characters long"),
            ("nocapital123!", "Password must contain at least one uppercase letter"),
            ("NOLOWERCASE123!", "Password must contain at least one lowercase letter"),
            ("NoNumberHere!!", "Password must contain at least one numeric digit"),
            ("NoSymbolPass123", "Password must contain at least one special symbol"),
        ],
    )
    def test_tc_reg_04_registration_fails_with_weak_password(
        self, auth_service, sample_student_payload, weak_password, reason
    ):
        """TC-REG-04: Verify registration fails when password policy rules are violated."""
        sample_student_payload["password"] = weak_password

        with pytest.raises(ValidationError) as exc_info:
            auth_service.register(sample_student_payload)

        assert reason.lower() in str(exc_info.value).lower()

    def test_tc_reg_05_registration_fails_without_accepting_terms(
        self, auth_service, sample_student_payload
    ):
        """TC-REG-05: Verify registration rejection when terms are not accepted."""
        sample_student_payload["acceptTerms"] = False

        with pytest.raises(ValidationError) as exc_info:
            auth_service.register(sample_student_payload)

        assert "accept the terms" in str(exc_info.value).lower()

    def test_tc_reg_06_registration_fails_on_duplicate_email(
        self, auth_service, sample_student_payload
    ):
        """TC-REG-06: Verify duplicate registration rejection for an existing email."""
        # First registration
        auth_service.register(sample_student_payload)

        # Attempt to register with the same email
        with pytest.raises(DuplicateUserError) as exc_info:
            auth_service.register(sample_student_payload)

        assert "already exists" in str(exc_info.value).lower()

    def test_tc_reg_07_alumni_fails_without_graduation_year(
        self, auth_service, sample_alumni_payload
    ):
        """TC-REG-07: Verify alumni registration fails if graduationYear is missing."""
        sample_alumni_payload["graduationYear"] = None

        with pytest.raises(ValidationError) as exc_info:
            auth_service.register(sample_alumni_payload)

        assert "graduation year is required" in str(exc_info.value).lower()

    def test_tc_reg_08_alumni_fails_with_year_of_study(
        self, auth_service, sample_alumni_payload
    ):
        """TC-REG-08: Verify alumni cannot specify student-only yearOfStudy."""
        sample_alumni_payload["yearOfStudy"] = 2

        with pytest.raises(ValidationError) as exc_info:
            auth_service.register(sample_alumni_payload)

        assert "applies to student accounts only" in str(exc_info.value).lower()

    @pytest.mark.parametrize("invalid_year", [0, 7, 10, -1])
    def test_tc_reg_09_student_fails_with_invalid_year_of_study(
        self, auth_service, sample_student_payload, invalid_year
    ):
        """TC-REG-09: Verify student yearOfStudy must be between 1 and 6."""
        sample_student_payload["yearOfStudy"] = invalid_year

        with pytest.raises(ValidationError) as exc_info:
            auth_service.register(sample_student_payload)

        assert "between 1 and 6" in str(exc_info.value).lower()

    @pytest.mark.parametrize(
        "first_name, last_name",
        [
            ("", "Doe"),
            ("   ", "Doe"),
            ("John", ""),
            ("John", "   "),
        ],
    )
    def test_tc_reg_10_registration_fails_missing_names(
        self, auth_service, sample_student_payload, first_name, last_name
    ):
        """TC-REG-10: Verify registration requires non-empty first and last names."""
        sample_student_payload["firstName"] = first_name
        sample_student_payload["lastName"] = last_name

        with pytest.raises(ValidationError) as exc_info:
            auth_service.register(sample_student_payload)

        assert "required" in str(exc_info.value).lower()


# ============================================================================
# LOGIN TEST CASES
# ============================================================================

class TestLogin:
    """Test group for user login and session authentication."""

    def test_tc_log_01_valid_student_login_success(
        self, auth_service, sample_student_payload
    ):
        """TC-LOG-01: Verify registered student can successfully log in."""
        auth_service.register(sample_student_payload)

        login_payload = {
            "email": sample_student_payload["email"],
            "password": sample_student_payload["password"],
        }
        res = auth_service.login(login_payload)

        assert res["message"] == "Signed in successfully"
        assert res["accessToken"].startswith("jwt_access_")
        assert res["refreshToken"].startswith("jwt_refresh_")
        assert res["user"]["email"] == sample_student_payload["email"]
        assert res["user"]["role"] == "STUDENT"

    def test_tc_log_02_valid_alumni_login_success(
        self, auth_service, sample_alumni_payload
    ):
        """TC-LOG-02: Verify registered alumni can successfully log in."""
        auth_service.register(sample_alumni_payload)

        login_payload = {
            "email": sample_alumni_payload["email"],
            "password": sample_alumni_payload["password"],
        }
        res = auth_service.login(login_payload)

        assert res["message"] == "Signed in successfully"
        assert res["user"]["role"] == "ALUMNI"

    def test_tc_log_03_login_fails_for_unregistered_email(self, auth_service):
        """TC-LOG-03: Verify login rejection for non-existent account."""
        login_payload = {
            "email": "notregistered@university.edu",
            "password": "RandomPassword123!",
        }

        with pytest.raises(AuthenticationError) as exc_info:
            auth_service.login(login_payload)

        assert "invalid email or password" in str(exc_info.value).lower()

    def test_tc_log_04_login_fails_with_incorrect_password(
        self, auth_service, sample_student_payload
    ):
        """TC-LOG-04: Verify login rejection when providing incorrect password."""
        auth_service.register(sample_student_payload)

        login_payload = {
            "email": sample_student_payload["email"],
            "password": "WrongPassword999!",
        }

        with pytest.raises(AuthenticationError) as exc_info:
            auth_service.login(login_payload)

        assert "invalid email or password" in str(exc_info.value).lower()

    def test_tc_log_05_login_fails_for_suspended_user(
        self, auth_service, sample_student_payload
    ):
        """TC-LOG-05: Verify suspended accounts are blocked from logging in."""
        auth_service.register(sample_student_payload)

        # Mark account as suspended (e.g. by administrator)
        user_email = sample_student_payload["email"]
        auth_service.users[user_email]["accountStatus"] = "SUSPENDED"

        login_payload = {
            "email": user_email,
            "password": sample_student_payload["password"],
        }

        with pytest.raises(AccountSuspendedError) as exc_info:
            auth_service.login(login_payload)

        assert "suspended" in str(exc_info.value).lower()

    def test_tc_log_06_login_fails_with_empty_password(
        self, auth_service, sample_student_payload
    ):
        """TC-LOG-06: Verify login rejection when password field is empty."""
        auth_service.register(sample_student_payload)

        login_payload = {
            "email": sample_student_payload["email"],
            "password": "",
        }

        with pytest.raises(ValidationError) as exc_info:
            auth_service.login(login_payload)

        assert "password is required" in str(exc_info.value).lower()
