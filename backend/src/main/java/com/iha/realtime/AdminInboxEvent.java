package com.iha.realtime;

/** A patient or provider wrote to MTA or asked to reopen a conversation. {@code kind}: patient or provider. */
public record AdminInboxEvent(String kind) {
}
