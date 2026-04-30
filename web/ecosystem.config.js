module.exports = {
  apps: [
    {
      name: 'lms-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: '3000',
      },
      watch: false,
      autorestart: true,
    },
    {
      name: 'lms-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
      },
      watch: false,
      autorestart: true,
    },
  ],
};
