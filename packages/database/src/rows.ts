/** The row an `INSERT ... RETURNING` or `UPDATE ... RETURNING` must have produced. */
export function firstRow<Row>(rows: Row[]): Row {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("RETURNING returned no row");
  }
  return row;
}
