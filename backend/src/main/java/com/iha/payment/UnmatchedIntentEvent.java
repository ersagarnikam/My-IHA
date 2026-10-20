package com.iha.payment;

/**
 * A provider callback for an intent that isn't a patient payment (e.g. a
 * doctor's registration fee). Other modules claim the ones they created.
 */
public record UnmatchedIntentEvent(String intentId, String chargeReference, boolean succeeded) {
}
