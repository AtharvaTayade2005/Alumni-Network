"""
Unittest Test Suite for Student & Alumni Authentication and Registration.
Topic: Alumni Network Portal - Validation of Login & Registration

To run:
    python -m unittest tests/python/test_auth_unittest.py -v
"""

import unittest
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


class TestStudentAlumniAuthUnittest(unittest.TestCase):
    """Unit test cases using Python's built-in unittest framework."""

    def setUp(self):
        """Precondition: Setup a fresh AuthService and valid test payloads."""
        self.auth_service = AuthService()

        self.student_payload = {
            "email": "student.mary@university.edu",
            "password": "ValidPassword987!",
            "firstName": "Mary",
            "lastName": "Major",
            "role": "STUDENT",
            "yearOfStudy": 2,
            "studentIdNumber": "STU-2025-4512",
            "department": "Information Technology",
            "acceptTerms": True,
        }

        self.alumni_payload = {
            "email": "alumni.robert@alumni.org",
            "password": "AlumPassword123#",
            "firstName": "Robert",
            "lastName": "Taylor",
            "role": "ALUMNI",
            "graduationYear": 2021,
            "department": "Civil Engineering",
            "acceptTerms": True,
        }

    # ========================================================================
    # REGISTRATION TEST CASES
    # ========================================================================

    def test_tc_reg_01_student_registration_success(self):
        """TC-REG-01: Validate student registration with all valid fields."""
        result = self.auth_service.register(self.student_payload)
        self.assertEqual(result["email"], "student.mary@university.edu")
        self.assertEqual(result["role"], "STUDENT")
        self.assertEqual(result["accountStatus"], "ACTIVE")
        self.assertIn("id", result)

    def test_tc_reg_02_alumni_registration_success(self):
        """TC-REG-02: Validate alumni registration with valid graduation year."""
        result = self.auth_service.register(self.alumni_payload)
        self.assertEqual(result["email"], "alumni.robert@alumni.org")
        self.assertEqual(result["role"], "ALUMNI")
        self.assertEqual(result["accountStatus"], "ACTIVE")

    def test_tc_reg_03_registration_fails_invalid_email(self):
        """TC-REG-03: Validate that malformed emails trigger ValidationError."""
        invalid_emails = ["bademail", "user@", "@domain.com", "user@site"]
        for email in invalid_emails:
            with self.subTest(email=email):
                payload = self.student_payload.copy()
                payload["email"] = email
                with self.assertRaises(ValidationError):
                    self.auth_service.register(payload)

    def test_tc_reg_04_registration_fails_weak_passwords(self):
        """TC-REG-04: Validate that weak passwords trigger ValidationError."""
        weak_passwords = [
            "short9!",              # too short
            "alllowercase123!",     # missing uppercase
            "ALLUPPERCASE123!",     # missing lowercase
            "NoNumbersAtAll!",      # missing number
            "NoSymbolsHere123",     # missing symbol
        ]
        for pwd in weak_passwords:
            with self.subTest(pwd=pwd):
                payload = self.student_payload.copy()
                payload["password"] = pwd
                with self.assertRaises(ValidationError):
                    self.auth_service.register(payload)

    def test_tc_reg_05_registration_fails_terms_not_accepted(self):
        """TC-REG-05: Validate rejection when acceptTerms is False."""
        self.student_payload["acceptTerms"] = False
        with self.assertRaises(ValidationError) as ctx:
            self.auth_service.register(self.student_payload)
        self.assertIn("accept the terms", str(ctx.exception).lower())

    def test_tc_reg_06_registration_fails_duplicate_email(self):
        """TC-REG-06: Validate rejection when registering duplicate email."""
        self.auth_service.register(self.student_payload)
        with self.assertRaises(DuplicateUserError):
            self.auth_service.register(self.student_payload)

    def test_tc_reg_07_alumni_fails_missing_graduation_year(self):
        """TC-REG-07: Validate alumni registration fails without graduationYear."""
        self.alumni_payload["graduationYear"] = None
        with self.assertRaises(ValidationError) as ctx:
            self.auth_service.register(self.alumni_payload)
        self.assertIn("graduation year is required", str(ctx.exception).lower())

    def test_tc_reg_08_alumni_fails_with_year_of_study(self):
        """TC-REG-08: Validate alumni cannot provide student yearOfStudy."""
        self.alumni_payload["yearOfStudy"] = 4
        with self.assertRaises(ValidationError) as ctx:
            self.auth_service.register(self.alumni_payload)
        self.assertIn("student accounts only", str(ctx.exception).lower())

    def test_tc_reg_09_student_fails_invalid_year_of_study(self):
        """TC-REG-09: Validate student yearOfStudy out of bounds (1-6)."""
        invalid_years = [0, 7, -1, 10]
        for yr in invalid_years:
            with self.subTest(year=yr):
                payload = self.student_payload.copy()
                payload["yearOfStudy"] = yr
                with self.assertRaises(ValidationError):
                    self.auth_service.register(payload)

    # ========================================================================
    # LOGIN TEST CASES
    # ========================================================================

    def test_tc_log_01_student_login_success(self):
        """TC-LOG-01: Validate login succeeds for existing student."""
        self.auth_service.register(self.student_payload)
        credentials = {
            "email": self.student_payload["email"],
            "password": self.student_payload["password"],
        }
        res = self.auth_service.login(credentials)
        self.assertEqual(res["message"], "Signed in successfully")
        self.assertEqual(res["user"]["email"], self.student_payload["email"])
        self.assertTrue(res["accessToken"].startswith("jwt_access_"))

    def test_tc_log_02_alumni_login_success(self):
        """TC-LOG-02: Validate login succeeds for existing alumni."""
        self.auth_service.register(self.alumni_payload)
        credentials = {
            "email": self.alumni_payload["email"],
            "password": self.alumni_payload["password"],
        }
        res = self.auth_service.login(credentials)
        self.assertEqual(res["message"], "Signed in successfully")
        self.assertEqual(res["user"]["role"], "ALUMNI")

    def test_tc_log_03_login_fails_unregistered_email(self):
        """TC-LOG-03: Validate login fails with unregistered email."""
        credentials = {
            "email": "ghost@university.edu",
            "password": "Password123!",
        }
        with self.assertRaises(AuthenticationError) as ctx:
            self.auth_service.login(credentials)
        self.assertIn("invalid email or password", str(ctx.exception).lower())

    def test_tc_log_04_login_fails_wrong_password(self):
        """TC-LOG-04: Validate login fails when given incorrect password."""
        self.auth_service.register(self.student_payload)
        credentials = {
            "email": self.student_payload["email"],
            "password": "WrongPassword999!",
        }
        with self.assertRaises(AuthenticationError) as ctx:
            self.auth_service.login(credentials)
        self.assertIn("invalid email or password", str(ctx.exception).lower())

    def test_tc_log_05_login_fails_suspended_user(self):
        """TC-LOG-05: Validate login is blocked for suspended accounts."""
        self.auth_service.register(self.student_payload)
        email = self.student_payload["email"]
        self.auth_service.users[email]["accountStatus"] = "SUSPENDED"

        credentials = {
            "email": email,
            "password": self.student_payload["password"],
        }
        with self.assertRaises(AccountSuspendedError) as ctx:
            self.auth_service.login(credentials)
        self.assertIn("suspended", str(ctx.exception).lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
