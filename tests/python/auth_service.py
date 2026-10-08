"""
Authentication and Registration Service Module for Alumni Network.
Implements business rules and validation logic for Student and Alumni accounts.
"""

import re
import hashlib
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List


class ValidationError(Exception):
    """Raised when user input fails validation constraints."""
    pass


class AuthenticationError(Exception):
    """Raised when authentication credentials or state are invalid."""
    pass


class DuplicateUserError(Exception):
    """Raised when registering an email that already exists."""
    pass


class AccountSuspendedError(Exception):
    """Raised when a suspended user attempts to log in."""
    pass


EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def validate_email(email: str) -> str:
    if not email or not isinstance(email, str):
        raise ValidationError("Email is required.")
    email = email.strip().lower()
    if len(email) < 5 or len(email) > 255:
        raise ValidationError("Email must be between 5 and 255 characters.")
    if not EMAIL_REGEX.match(email):
        raise ValidationError("Invalid email address format.")
    return email


def validate_password(password: str) -> None:
    if not password or not isinstance(password, str):
        raise ValidationError("Password is required.")
    if len(password) < 10:
        raise ValidationError("Password must be at least 10 characters long.")
    if len(password) > 128:
        raise ValidationError("Password must not exceed 128 characters.")
    if not re.search(r"[a-z]", password):
        raise ValidationError("Password must contain at least one lowercase letter.")
    if not re.search(r"[A-Z]", password):
        raise ValidationError("Password must contain at least one uppercase letter.")
    if not re.search(r"[0-9]", password):
        raise ValidationError("Password must contain at least one numeric digit.")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise ValidationError("Password must contain at least one special symbol.")


def hash_password(password: str) -> str:
    """Simple deterministic hash for unit testing demonstration."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


class AuthService:
    """Authentication and User Management Service."""

    def __init__(self):
        # In-memory storage for unit testing isolation
        self.users: Dict[str, Dict[str, Any]] = {}

    def register(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Registers a new user (Student or Alumni).
        Validates payload, enforces role constraints, and prevents duplicates.
        """
        # 1. Validate required terms acceptance
        if not data.get("acceptTerms"):
            raise ValidationError("You must accept the terms and conditions to register.")

        # 2. Validate email and password
        email = validate_email(data.get("email", ""))
        password = data.get("password", "")
        validate_password(password)

        # 3. Check for duplicates
        if email in self.users:
            raise DuplicateUserError("An account with this email already exists.")

        # 4. Validate Names
        first_name = (data.get("firstName") or "").strip()
        last_name = (data.get("lastName") or "").strip()
        if not first_name or len(first_name) > 80:
            raise ValidationError("First name is required and cannot exceed 80 characters.")
        if not last_name or len(last_name) > 80:
            raise ValidationError("Last name is required and cannot exceed 80 characters.")

        # 5. Role Validation
        role = data.get("role")
        if role not in ("STUDENT", "ALUMNI"):
            raise ValidationError("Role must be either 'STUDENT' or 'ALUMNI'.")

        current_year = datetime.now().year

        if role == "ALUMNI":
            grad_year = data.get("graduationYear")
            if grad_year is None:
                raise ValidationError("Graduation year is required for alumni accounts.")
            try:
                grad_year = int(grad_year)
            except (ValueError, TypeError):
                raise ValidationError("Graduation year must be a valid integer.")
            if grad_year < 1950 or grad_year > (current_year + 10):
                raise ValidationError("Graduation year is out of valid range (1950 - current + 10).")

            if "yearOfStudy" in data and data["yearOfStudy"] is not None:
                raise ValidationError("Year of study applies to student accounts only.")

        elif role == "STUDENT":
            year_of_study = data.get("yearOfStudy")
            if year_of_study is not None:
                try:
                    year_of_study = int(year_of_study)
                except (ValueError, TypeError):
                    raise ValidationError("Year of study must be an integer between 1 and 6.")
                if year_of_study < 1 or year_of_study > 6:
                    raise ValidationError("Year of study must be between 1 and 6.")

        # 6. Create User Record
        user_id = str(uuid.uuid4())
        user_record = {
            "id": user_id,
            "email": email,
            "passwordHash": hash_password(password),
            "firstName": first_name,
            "lastName": last_name,
            "role": role,
            "graduationYear": data.get("graduationYear") if role == "ALUMNI" else None,
            "yearOfStudy": data.get("yearOfStudy") if role == "STUDENT" else None,
            "studentIdNumber": data.get("studentIdNumber"),
            "department": data.get("department"),
            "isEmailVerified": False,
            "accountStatus": "ACTIVE",  # ACTIVE, SUSPENDED, INACTIVE
            "createdAt": datetime.now().isoformat(),
        }

        self.users[email] = user_record

        # Return safe public profile
        return {
            "id": user_record["id"],
            "email": user_record["email"],
            "firstName": user_record["firstName"],
            "lastName": user_record["lastName"],
            "role": user_record["role"],
            "accountStatus": user_record["accountStatus"],
            "message": "User registered successfully",
        }

    def login(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Authenticates user with email and password.
        Returns auth token and user session data.
        """
        email = validate_email(data.get("email", ""))
        password = data.get("password", "")
        if not password:
            raise ValidationError("Password is required.")

        user = self.users.get(email)
        if not user:
            raise AuthenticationError("Invalid email or password.")

        if user["passwordHash"] != hash_password(password):
            raise AuthenticationError("Invalid email or password.")

        if user["accountStatus"] == "SUSPENDED":
            raise AccountSuspendedError("Your account has been suspended. Please contact administrator.")

        if user["accountStatus"] == "INACTIVE":
            raise AuthenticationError("Your account is currently inactive.")

        # Generate mock session tokens
        access_token = f"jwt_access_{uuid.uuid4().hex[:16]}"
        refresh_token = f"jwt_refresh_{uuid.uuid4().hex[:24]}"

        return {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "firstName": user["firstName"],
                "lastName": user["lastName"],
                "role": user["role"],
                "accountStatus": user["accountStatus"],
            },
            "message": "Signed in successfully",
        }
