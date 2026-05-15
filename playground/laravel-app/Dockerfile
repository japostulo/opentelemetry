FROM php:8.2-cli AS base

RUN apt-get update && apt-get install -y \
    unzip curl git libzip-dev libcurl4-openssl-dev \
    && docker-php-ext-install zip curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# -------------------------------------------------------------------
FROM base AS app

WORKDIR /app

# Disable opcache so PHP file changes in bind-mounted packages are picked up immediately
RUN echo "opcache.enable=0\nopcache.enable_cli=0" > /usr/local/etc/php/conf.d/disable-opcache.ini

# Copy the lib as a local path repository
COPY packages/laravel/ /packages/laravel/

# Copy the Laravel skeleton
COPY playground/laravel-app/ /app/

# Install dependencies (haoc/opentelemetry-laravel via path repo)
RUN composer install --no-dev --no-interaction --optimize-autoloader

# Create required storage directories
RUN mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache \
    && chmod -R 777 storage bootstrap/cache

EXPOSE 8080
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8080"]
