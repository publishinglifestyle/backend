const generateMinefield = (width, height, numMines) => {
    // Initialize the minefield with empty cells
    const minefield = Array.from({ length: height }, () => Array.from({ length: width }, () => ({
        mines: 0,
        isMine: false
    })));

    // Place mines randomly
    let minesPlaced = 0;
    while (minesPlaced < numMines) {
        const row = Math.floor(Math.random() * height);
        const col = Math.floor(Math.random() * width);

        if (!minefield[row][col].isMine) {
            minefield[row][col].isMine = true;
            minesPlaced++;

            // Update numbers around the mine
            for (let r = Math.max(0, row - 1); r <= Math.min(height - 1, row + 1); r++) {
                for (let c = Math.max(0, col - 1); c <= Math.min(width - 1); c++) {
                    if (!minefield[r][c].isMine) {
                        minefield[r][c].mines++;
                    }
                }
            }
        }
    }

    // Mark gray cells (those with 0 surrounding mines and no mine)
    const output = minefield.map(row =>
        row.map(cell => ({
            mines: cell.mines,
            isMine: cell.isMine,
            isGray: cell.mines === 0 && !cell.isMine // Ensure no mine is placed on gray cells
        }))
    );

    return output;
};

module.exports = { generateMinefield };
