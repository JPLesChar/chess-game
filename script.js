@@
-newGameButton.addEventListener('click', resetGame);
+// Resolve resetGame when clicked so extras.js can clear the move history too.
+newGameButton.addEventListener('click', () => resetGame());
 resetGame();
