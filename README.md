# Dingir
Dingir is a Discord.js bot written in TypeScript, with some of the basic functions that we use in the Irkallu discord server.
Requires Node 24 or newer to run.

## Getting started
To run bot, all you need to do is...
1. Clone the repository
2. Install dependencies using `npm install` or `yarn`
3. Copy the `.env.example` file to `.env`, and provide a Discord Bot token ([Discord Developer Portal](https://discord.com/developers/docs/topics/oauth2#bots))
4. Build the project with `npm run build` or `yarn run build`
5. Run the build project with `npm start` or `yarn start`

## Persistence
Data is currently stored locally in a SQLite database, placed in a `data` folder at the root of the repository.
In the future, I want to implement functionality to be able to use a SQL Server purely by configuration.
