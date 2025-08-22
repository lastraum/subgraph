module.exports = {
  apps: [
    {
      name: 'forge-subgraph',
      script: 'dev-server.js',
      cwd: '/root/express/the-forge-subgraph',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5755,
        CONTRACT_ADDRESS: '0xD21C2B389073cC05251D3afC0B41674BF05C62e9',
        RPC_URL: 'https://sepolia.base.org',
        START_BLOCK: '18800000',
        NETWORK: 'base-sepolia'
      },
      log_file: '/var/log/pm2/forge-subgraph.log',
      out_file: '/var/log/pm2/forge-subgraph-out.log',
      error_file: '/var/log/pm2/forge-subgraph-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
