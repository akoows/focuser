export function secureUser(unsecuredUser) {
    const securedUser = {
        id: unsecuredUser.id,
        name: unsecuredUser.name,
        email: unsecuredUser.email,
        avatarUrl: unsecuredUser.avatarUrl,
        createdAt: unsecuredUser.createdAt,
        applicationIDs : unsecuredUser.applicationIDs
    }

    return securedUser
}