import './styles.css';
import { RacingGame } from './game/RacingGame.js';

const app = document.querySelector('#app');

if (!app) {
  throw new Error('Missing #app root element.');
}

const game = new RacingGame(app);
game.start();
