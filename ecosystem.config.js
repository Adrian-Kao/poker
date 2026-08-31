module.exports = {
  apps: [
    {
      name: "poker-colyseus-server",
      script: "./dist/server/server/index.js",
      instances: 1,
      exec_mode: "fork",
      wait_ready: true,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
