using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Security.Permissions;
using System.Web.Script.Serialization;
using System.Data;
using System.Runtime.InteropServices;

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
    }
}
