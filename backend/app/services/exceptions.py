class ServiceError(Exception):
    pass


class InvalidCredentialsError(ServiceError):
    pass


class InvalidRefreshTokenError(ServiceError):
    pass


class NotAuthenticatedError(ServiceError):
    pass


class AccessDeniedError(ServiceError):
    pass
