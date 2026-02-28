/**
 * Reusable data table with finance-grade styling
 * @param {Object} props
 * @param {Array} props.columns - Column definitions with header, field, render, align
 * @param {Array} props.data - Row data
 * @param {function} [props.onRowClick] - Row click handler
 * @param {string} [props.emptyMessage] - Message shown when data is empty
 */
export default function Table({ columns, data, onRowClick, emptyMessage = 'No data available' }) {
  if (!data || data.length === 0) {
    return <div className="text-center py-12 text-base-content/40 text-sm">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="finance-table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className={column.align === 'right' ? 'num' : ''}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              onClick={() => onRowClick && onRowClick(row)}
              className={onRowClick ? 'cursor-pointer' : ''}
            >
              {columns.map((column, colIndex) => (
                <td key={colIndex} className={column.align === 'right' ? 'num' : ''}>
                  {column.render ? column.render(row) : row[column.field]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
