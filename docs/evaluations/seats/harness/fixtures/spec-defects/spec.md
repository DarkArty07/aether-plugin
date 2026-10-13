# Sign-up with email and password

- Date: 2026-10-13
- Status: Draft
- Intent: people sign up with an email and a password, hashed with bcrypt.

## Criteria

- C1: A person signs up with a valid email and a password of at least 12 characters. Evidence: a test posts to `/signup` and gets 201, and the stored row holds a bcrypt hash, never the password.
- C2: Sign-up feels fast.
- C3: A second sign-up with the same email is refused. Evidence: a test gets 409 on the second post.

## User scenarios

1. Given no account for ana@example.com, when Ana posts her email and a 14-character password to `/signup`, then she gets 201 and can log in.
2. Given an account for ana@example.com, when someone posts the same email, then they get 409.

## Requirements

- R1. `POST /signup` takes `{ email, password }` and answers 201 with `{ id }`. Serves: C1
- R2. The password is hashed with bcrypt, cost 12, before it is stored. Serves: C1
- R3. An email already in use answers 409 with `{ error: "email-taken" }`. Serves: C3

## Proposals

None.

## Assumptions

1. Emails are compared in lower case. The owner can reverse it.

## Irreversible actions

None.

## Out of scope

- Password reset.
