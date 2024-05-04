# Just Another Chess Game

## What's this?

It's just another chess game called Just Another Chess Game. It is partially a multiplayer game. (You should be able to play with another person on the same network, though we almost always open another browser tab)

## How to setup and play

The server setup requires Node.js, so you will need to download that first [here](https://nodejs.org/en/download/)

First, download the repository. Open the command line and navigate to the game folder. There, enter `npm install`. This will get the packages required the get the server running. After the installation is complete, from the same command line enter `npm start`, which will start the server and give you the number of the port it is listening to (this is usually 3000). At this point, the server is up and running, where you can play virtually an infinite amount of chess games simultaneously.

After setting up the server, you can open a browser and type in localhost:PORT_NUMBER (so for port number 3000, enter localhost:3000). The game will only start after another person also searches for a match, which you can simulate by opening another tab in your browser and entering the same localhost.

## Credits

Deniz Tan Hasdemir & Can Sağtürk 
