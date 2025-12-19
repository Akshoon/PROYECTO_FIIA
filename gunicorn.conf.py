# Gunicorn configuration file

# Bind to all interfaces on port 5000
bind = "0.0.0.0:5000"

# Number of worker processes
workers = 4

# Timeout for worker processes (5 minutes)
timeout = 3000

# Keep alive connections
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Graceful timeout
graceful_timeout = 120
