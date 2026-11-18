package com.iha.provider;

import java.time.Instant;
import java.util.UUID;

/**
 * A hospital or visa lawyer that pays MTA a registration fee once (after
 * approval) and an annual membership fee. See {@code providerfee.ProviderFeeService}.
 */
public interface FeePayingProvider {

	String HOSPITAL = "hospital";
	String LAWYER = "lawyer";

	/** {@link #HOSPITAL} or {@link #LAWYER}. */
	String providerType();

	UUID getId();

	UUID getUserId();

	String getName();

	boolean isApproved();

	/** When the registration fee was paid, or waived (see {@link #isRegistrationFeeWaived}). */
	Instant getRegistrationFeePaidAt();

	/** The registration fee was 0 when MTA approved the account, so nothing was charged. */
	boolean isRegistrationFeeWaived();

	/** Null for accounts settled before the yearly cycle was recorded: then a year after registration. */
	Instant getAnnualFeeNextDueAt();

	void markRegistrationFeePaid(Instant paidAt, Instant annualFeeNextDueAt);

	void markRegistrationFeeWaived(Instant at, Instant annualFeeNextDueAt);

	void markAnnualFeePaid(Instant annualFeeNextDueAt);

}
