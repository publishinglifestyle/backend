const { PNG } = require('pngjs');

/**
 * Generates a maze using recursive backtracking and returns it as a base64-encoded PNG.
 * @param {number} width - The width of the maze in cells (should be an odd number).
 * @param {number} height - The height of the maze in cells (should be an odd number).
 * @param {number} cellSize - The size of each cell in the maze.
 * @returns {Promise<string>} - The base64-encoded PNG image of the maze.
 */
function generateMazeBase64(width, height, cellSize = 10) {
    // Create a 2D array for the maze, initialized to false (no walls)
    let maze = Array(height).fill(null).map(() => Array(width).fill(false));

    // Directions array (right, down, left, up)
    const directions = [
        [1, 0],  // right
        [0, 1],  // down
        [-1, 0], // left
        [0, -1]  // up
    ];

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function carvePassagesFrom(cx, cy) {
        shuffleArray(directions);

        directions.forEach(direction => {
            const nx = cx + direction[0] * 2;
            const ny = cy + direction[1] * 2;

            if (nx >= 0 && ny >= 0 && nx < width && ny < height && !maze[ny][nx]) {
                maze[cy + direction[1]][cx + direction[0]] = true; // Carve path
                maze[ny][nx] = true; // Move to new cell

                carvePassagesFrom(nx, ny); // Recursively carve passages
            }
        });
    }

    // Start carving from the top-left corner
    maze[1][1] = true; // Start inside the maze
    carvePassagesFrom(1, 1);

    // Add borders around the maze
    for (let x = 0; x < width; x++) {
        maze[0][x] = false; // Top border
        maze[height - 1][x] = false; // Bottom border
    }
    for (let y = 0; y < height; y++) {
        maze[y][0] = false; // Left border
        maze[y][width - 1] = false; // Right border
    }

    // Create entrance and exit
    maze[0][1] = true; // Entrance at the top
    maze[height - 1][width - 2] = true; // Exit at the bottom

    return drawMazeBase64(maze, cellSize);
}

/**
 * Draws the maze and returns it as a base64-encoded PNG image.
 * @param {boolean[][]} maze - The 2D array representing the maze.
 * @param {number} cellSize - The size of each cell in the maze.
 * @returns {Promise<string>} - The base64-encoded PNG image of the maze.
 */
function drawMazeBase64(maze, cellSize) {
    return new Promise((resolve, reject) => {
        const width = maze[0].length * cellSize;
        const height = maze.length * cellSize;
        const png = new PNG({ width, height });

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const mazeX = Math.floor(x / cellSize);
                const mazeY = Math.floor(y / cellSize);
                const idx = (width * y + x) << 2;

                if (maze[mazeY][mazeX]) {
                    png.data[idx] = 255;    // R
                    png.data[idx + 1] = 255; // G
                    png.data[idx + 2] = 255; // B
                    png.data[idx + 3] = 255; // A
                } else {
                    png.data[idx] = 0;    // R
                    png.data[idx + 1] = 0; // G
                    png.data[idx + 2] = 0; // B
                    png.data[idx + 3] = 255; // A
                }
            }
        }

        const chunks = [];
        png.pack()
            .on('data', (chunk) => chunks.push(chunk))
            .on('end', () => {
                const buffer = Buffer.concat(chunks);
                const base64 = buffer.toString('base64');
                resolve(base64);
            })
            .on('error', (err) => reject(err));
    });
}

module.exports = { generateMazeBase64 };
