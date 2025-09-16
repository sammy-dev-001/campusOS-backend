module.exports = {
  apps: [
    {
      name: 'campusos-backend',
      script: './server.js',
      instances: 'max',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max_old_space_size=1024',
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '5s',
      listen_timeout: 8000,
      kill_timeout: 1600,
      wait_ready: true,
      // Auto-restart if memory usage exceeds 1GB
      max_memory_restart: '1G',
      // Enable source map support
      source_map_support: true,
      // Enable cluster mode
      exec_mode: 'cluster',
      // Number of instances to start (will be set to number of CPU cores by 'max')
      instances: 'max',
      // Watch for file changes (disabled in production)
      watch: process.env.NODE_ENV === 'development',
      // Ignore watched files
      ignore_watch: [
        'node_modules',
        '.git',
        'logs',
        '*.log',
        '*.md',
        '.DS_Store',
        '*.test.js',
        'test',
        'coverage'
      ],
      // Environment variables
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max_old_space_size=1024',
        // Add other environment variables here
      },
      env_development: {
        NODE_ENV: 'development',
        DEBUG: 'app:*',
      },
      // Log rotation
      log_rotate: {
        max_size: '10M',
        retain: 5,
        compress: true,
        date_format: 'YYYY-MM-DD_HH-mm-ss',
        worker_interval: '30',
        rotate_module: true
      },
      // Metrics collection
      vizion: true,
      // Process management
      min_uptime: '60s',
      max_restarts: 10,
      restart_delay: 5000,
      // Advanced features
      merge_logs: true,
      log_type: 'json',
      // Enable PMX for monitoring
      pmx: true,
      // Node arguments
      node_args: [
        '--inspect=0.0.0.0:9229',
        '--max-http-header-size=16384',
        '--no-deprecation',
        '--trace-warnings'
      ],
      // Environment variables specific to this instance
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max_old_space_size=1024',
        PORT: 5000,
      },
      // Environment variables for development
      env_development: {
        NODE_ENV: 'development',
        DEBUG: 'app:*',
        PORT: 5000,
      },
      // Environment variables for production
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      }
    }
  ]
};
