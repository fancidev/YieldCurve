using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Security.Permissions;
using System.Web.Script.Serialization;
using System.Data;
using System.Runtime.InteropServices;
using System.IO;

namespace YieldCurveDemo
{
    // http://www.dotnetfunda.com/articles/show/840/working-with-webbrowser-in-wpf
    [PermissionSet(SecurityAction.Demand, Name = "FullTrust")]
    [ComVisible(true)]
    public class Server
    {
        public string HandleRequest(string action, string jsonArguments)
        {
#if DEBUG
            Console.WriteLine("Request: " + action);
#endif

            // Dispatch the request to the appropriate handler.
            object result;
            switch (action.ToLowerInvariant())
            {
                case "echo":
                    return jsonArguments;
                case "getdata":
                    result = GetData();
                    break;
                case "getversion":
                    result = GetVersion();
                    break;
                default:
                    result = null;
                    break;
            }

            // Convert the response to JSON and return.
            string jsonResult = (result == null) ? null :
                new JavaScriptSerializer().Serialize(result);
#if DEBUG
            Console.WriteLine("Response: " + jsonResult.Substring(0, 1000));
#endif
            return jsonResult;
        }

        private static string Echo(string text)
        {
            return text;
        }

        private static string GetVersion()
        {
            return "0.1.2";
        }

        private static object[][] GetData()
        {
            DataTable table = TimeSeries.GetPanelData(TimeSeries.LoadHistoricalData());
            WriteToFile(table, @"E:\test-json.txt");

            List<object[]> rows = new List<object[]>();

            // Put column headers in first row.
            rows.Add(table.Columns.OfType<DataColumn>().Select(c => c.ColumnName).ToArray());

            // For each data row, format the date string, and replace any
            // non-numeric value with null. Do not add an observation if
            // all fields are null.
            foreach (DataRow dataRow in table.Rows)
            {
                var row = dataRow.ItemArray;
                row[0] = ((DateTime)row[0]).ToString("yyyy-MM-dd");

                int numValid = 0;
                for (int i = 1; i < row.Length; i++)
                {
                    double v = (double)row[i];
                    if (double.IsNaN(v) || double.IsInfinity(v))
                        row[i] = null;
                    else
                        ++numValid;
                }
                if (numValid > 0)
                    rows.Add(row);
            }
            return rows.ToArray();
        }

        private static void WriteToFile(DataTable table, string fileName)
        {
            using (StreamWriter writer = new StreamWriter(fileName))
            {
                int n = table.Columns.Count;

                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < n; i++)
                {
                    if (i == 0)
                        sb.Append("[");
                    else
                        sb.Append(",");
                    sb.Append("\"" + table.Columns[i].ColumnName + "\"");
                }
                sb.Append("],");
                writer.WriteLine(sb.ToString());
                sb.Clear();

                foreach (DataRow row in table.Rows)
                {
                    object[] rowData = row.ItemArray;
                    bool isValid = true;
                    for (int j = 1; j < n; j++)
                    {
                        if (!(rowData[j] is double && !double.IsNaN((double)rowData[j])))
                            isValid = false;
                    }
                    if (!isValid)
                        continue;

                    DateTime dt = (DateTime)rowData[0];
                    sb.AppendFormat("[new Date({0},{1},{2})", dt.Year, dt.Month - 1, dt.Day);
                    for (int j = 1; j < n; j++)
                    {
                        sb.AppendFormat(",{0}", rowData[j]);
                    }
                    sb.Append("],");
                    writer.WriteLine(sb.ToString());
                    sb.Clear();
                }
            }
        }
    }
}