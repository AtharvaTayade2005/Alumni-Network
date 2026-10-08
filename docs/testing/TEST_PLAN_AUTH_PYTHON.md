# Test Case Plan: Student & Alumni Authentication and Registration

## 1. Document Control & Overview

| Attribute | Details |
| :--- | :--- |
| **Project Topic** | Alumni Network Web Portal |
| **Component Under Test** | Authentication & User Registration Subsystem |
| **Testing Level** | Unit Testing (Student / Developer Driven) |
| **Frameworks Evaluated** | `pytest` (v9.1+) / `unittest` (Standard Library) |
| **Document Version** | 1.0.0 |
| **Author** | QA & Development Team / Student Authors |
| **Target Runtime** | Python 3.10+ (Tested on Python 3.14.0) |

---

## 2. Testing Objectives

1. Validate that student and alumni registration handles positive and negative inputs according to the system specification.
2. Verify role-based integrity:
   - **Student**: Requires valid `yearOfStudy` (1 to 6) and optional `studentIdNumber`.
   - **Alumni**: Requires `graduationYear` (>= 1950 and <= current year + 10) and forbids `yearOfStudy`.
3. Verify password policy enforcement:
   - Minimum 10 characters, maximum 128 characters.
   - At least 1 lowercase letter, 1 uppercase letter, 1 numeric digit, and 1 special symbol.
4. Verify duplicate email detection and terms acceptance validation.
5. Validate login authentication flow, credential verification, error handling for unknown emails / wrong passwords, and blocked access for suspended accounts.

---

## 3. Test Strategy & Methodologies

| Methodology | Application in Suite |
| :--- | :--- |
| **Equivalence Partitioning (EP)** | Valid emails vs. invalid format patterns; valid password classes vs. deficient passwords. |
| **Boundary Value Analysis (BVA)** | Password length boundaries (9 vs 10 chars); Year of Study limits (0, 1, 6, 7). |
| **Negative Testing** | Testing unaccepted terms, duplicate email registration, non-existent users, wrong passwords, and suspended accounts. |
| **Isolation & Fixtures** | Isolated in-memory storage per test to prevent test cross-contamination. |

---

## 4. Test Environment Specification

- **Programming Language**: Python 3.14.0
- **Test Frameworks**:
  - `pytest 9.1.1` (`@pytest.fixture`, `@pytest.mark.parametrize`)
  - `unittest` (Standard library `TestCase`, `subTest`, `assertRaises`)
- **Source Files**:
  - Implementation: [`tests/python/auth_service.py`](file:///d:/Coding/GitHub/Alumini-Network/tests/python/auth_service.py)
  - Pytest Suite: [`tests/python/test_auth_pytest.py`](file:///d:/Coding/GitHub/Alumini-Network/tests/python/test_auth_pytest.py)
  - Unittest Suite: [`tests/python/test_auth_unittest.py`](file:///d:/Coding/GitHub/Alumini-Network/tests/python/test_auth_unittest.py)
  - Test Runner: [`tests/python/run_tests.py`](file:///d:/Coding/GitHub/Alumini-Network/tests/python/run_tests.py)

---

## 5. Test Case Matrix

### 5.1 Registration Module (`TC-REG`)

| Test Case ID | Test Case Title | Input Data / Preconditions | Expected Outcome | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-REG-01** | Successful Student Registration | Email: `student.john@university.edu`<br>Password: `SecurePassword123!`<br>Role: `STUDENT`, Year: `3`, Terms: `True` | Registration succeeds, User ID generated, status `ACTIVE` | User profile returned with ID & ACTIVE status | **PASS** |
| **TC-REG-02** | Successful Alumni Registration | Email: `alumni.jane@alumni.org`<br>Password: `GraduatedPass2020#`<br>Role: `ALUMNI`, Grad Year: `2020`, Terms: `True` | Registration succeeds, User ID generated, status `ACTIVE` | Alumni registered with graduation year stored | **PASS** |
| **TC-REG-03** | Invalid Email Format | Inputs: `plainaddress`, `@missinguser.com`, `user@.com`, empty string `""` | `ValidationError` raised with "Invalid email address format" | `ValidationError` raised for all invalid cases | **PASS** |
| **TC-REG-04** | Password Policy Violations | Too short (`Short1!`), No Upper (`nocap123!`), No Lower (`NOLOW123!`), No Digit (`NoNumber!!`), No Symbol (`NoSym12345`) | `ValidationError` raised stating specific password requirement | `ValidationError` raised with exact constraint message | **PASS** |
| **TC-REG-05** | Terms & Conditions Not Accepted | `acceptTerms = False` with otherwise valid student payload | `ValidationError` with "You must accept the terms" | `ValidationError` raised | **PASS** |
| **TC-REG-06** | Duplicate Email Registration | Same email registered twice | `DuplicateUserError` with "already exists" | `DuplicateUserError` raised on second attempt | **PASS** |
| **TC-REG-07** | Alumni Missing Graduation Year | Role: `ALUMNI`, `graduationYear = None` | `ValidationError` with "Graduation year is required" | `ValidationError` raised | **PASS** |
| **TC-REG-08** | Alumni With Student Year of Study | Role: `ALUMNI`, `yearOfStudy = 2` | `ValidationError` with "Year of study applies to student accounts only" | `ValidationError` raised | **PASS** |
| **TC-REG-09** | Student Invalid Year of Study | Role: `STUDENT`, `yearOfStudy` in `{0, 7, 10, -1}` | `ValidationError` with "between 1 and 6" | `ValidationError` raised across all out-of-bound values | **PASS** |
| **TC-REG-10** | Missing First or Last Name | `firstName = ""` or `lastName = ""` or whitespace | `ValidationError` with "required" | `ValidationError` raised | **PASS** |

### 5.2 Login Module (`TC-LOG`)

| Test Case ID | Test Case Title | Input Data / Preconditions | Expected Outcome | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-LOG-01** | Successful Student Login | Registered student credentials: `student.john@university.edu`, `SecurePassword123!` | Login succeeds, returns `accessToken`, `refreshToken`, user object | Tokens issued, user verified | **PASS** |
| **TC-LOG-02** | Successful Alumni Login | Registered alumni credentials: `alumni.jane@alumni.org`, `GraduatedPass2020#` | Login succeeds, returns session tokens and alumni profile | Tokens issued, user verified | **PASS** |
| **TC-LOG-03** | Login with Unregistered Email | Email: `notregistered@university.edu`, any password | `AuthenticationError` with "Invalid email or password" | `AuthenticationError` raised | **PASS** |
| **TC-LOG-04** | Login with Incorrect Password | Valid registered email, incorrect password: `WrongPassword999!` | `AuthenticationError` with "Invalid email or password" | `AuthenticationError` raised | **PASS** |
| **TC-LOG-05** | Login Blocked for Suspended Account | Registered account with status set to `SUSPENDED` | `AccountSuspendedError` with suspension notification | `AccountSuspendedError` raised | **PASS** |
| **TC-LOG-06** | Login with Empty Password | Registered email, password: `""` | `ValidationError` with "Password is required" | `ValidationError` raised | **PASS** |

---

## 6. How to Run the Tests

### Option A: Using Pytest
```bash
python -m pytest tests/python/test_auth_pytest.py -v
```

### Option B: Using Unittest
```bash
python -m unittest tests/python/test_auth_unittest.py -v
```

### Option C: Unified Automated Runner
```bash
python tests/python/run_tests.py
```
