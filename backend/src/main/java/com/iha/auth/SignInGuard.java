package com.iha.auth;

/**
 * Lets a role module veto sign-in for an otherwise valid account, e.g. a
 * soft-deleted patient. Throw an {@link com.iha.common.ApiException} to refuse.
 */
public interface SignInGuard {

	void check(AppUser user);

}
