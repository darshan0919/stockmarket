export default function Table({ columns, data, onRowClick, emptyMessage = 'No data available' }) {
  if (!data || data.length === 0) {
    return <div className="text-center py-12 text-gray-500">{emptyMessage}</div>;
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className={column.align === 'right' ? 'text-right' : 'text-left'}>
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
                <td
                  key={colIndex}
                  className={column.align === 'right' ? 'text-right' : 'text-left'}
                >
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
