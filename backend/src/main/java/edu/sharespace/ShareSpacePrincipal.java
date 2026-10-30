package edu.sharespace;

import edu.sharespace.Domain.User;

/** Authenticated application identity resolved by a trusted server-side mechanism. */
record ShareSpacePrincipal(String subject, User user) { }
