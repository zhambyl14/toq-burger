// pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'tok-whatsapp-bot',
      script: 'index.mjs',
      node_args: '--env-file-if-exists=.env',
      cwd: __dirname,
      instances: 1, // must be exactly one: a WhatsApp session cannot be shared
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 10000,
      kill_timeout: 25000,
      max_memory_restart: '700M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
