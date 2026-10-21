# доменные ошибки сервисов — слой api переводит их в HTTP-ответы


class ServiceError(Exception):
    pass


class InvalidCredentialsError(ServiceError):
    pass


class InvalidRefreshTokenError(ServiceError):
    pass


class NotAuthenticatedError(ServiceError):
    pass
