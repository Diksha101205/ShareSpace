package edu.sharespace;

import edu.sharespace.Domain.User;

public record FirebasePrincipal(String uid, User user) { }
