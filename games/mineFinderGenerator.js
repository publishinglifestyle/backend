const minesweeper = require('minesweeper');

function generateMinefield(width, height, numMines, num_puzzles = 1) {
    const puzzles = [];

    for (let i = 0; i < num_puzzles; i++) {
        // Create a mine array using the library
        const mineArray = minesweeper.generateMineArray({
            rows: height,
            cols: width,
            mines: numMines
        });

        // Create a board using the mine array
        const board = new minesweeper.Board(mineArray);
        const grid = board.grid();

        // Identify all gray cells first
        const grayCells = [];

        grid.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                if (cell.numAdjacentMines === 0 && !cell.isMine) {
                    grayCells.push({ rowIndex, colIndex });
                }
            });
        });

        // Randomly select a subset of gray cells to display
        const numGrayToShow = Math.floor(grayCells.length / 2); // Show 50% of gray cells
        const grayCellsToShow = grayCells.sort(() => 0.5 - Math.random()).slice(0, numGrayToShow);

        const output = grid.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
                const isGray = grayCellsToShow.some(
                    grayCell => grayCell.rowIndex === rowIndex && grayCell.colIndex === colIndex
                );
                const shouldShowAsGrayInSolution = !isGray && grayCells.some(
                    grayCell => grayCell.rowIndex === rowIndex && grayCell.colIndex === colIndex
                );

                return {
                    x: colIndex,
                    y: rowIndex,
                    mines: cell.numAdjacentMines,
                    isMine: cell.isMine,
                    isGray: isGray,
                    shouldShowAsGrayInSolution: shouldShowAsGrayInSolution
                };
            })
        );

        puzzles.push({ puzzle: output, solution: output });
    }

    return puzzles;
}


module.exports = { generateMinefield };
