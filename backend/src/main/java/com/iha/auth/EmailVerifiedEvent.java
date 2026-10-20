package com.iha.auth;

/** Published inside the verification transaction; role modules react (e.g. the patient welcome notification). */
public record EmailVerifiedEvent(AppUser user) {
}
