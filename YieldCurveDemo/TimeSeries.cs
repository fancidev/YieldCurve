using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.IO;
using System.Globalization;
using System.Data;

namespace YieldCurveDemo
{
    public class TimeSeries : SortedDictionary<DateTime, double>
    {
        public string Name { get; set; }

        public static IList<TimeSeries> LoadHistoricalData()
        {
            List<TimeSeries> panelData = new List<TimeSeries>();
            string directoryName = @"../../../Data/USDIRS";
            string[] terms = { "3M", "1Y", "2Y", "3Y", "4Y", "5Y", "7Y", "10Y", "30Y" };
            foreach (string term in terms)
            {
                string fileName = Path.Combine(directoryName, term + ".csv");
                TimeSeries series = LoadHistoricalData(fileName, term);
                panelData.Add(series);
            }
            return panelData;
        }

        public static DataTable GetPanelData(IEnumerable<TimeSeries> seriesCollection)
        {
            DataTable table = new DataTable();
            table.Columns.Add("Date", typeof(DateTime));

            // Perform multiway merge.
            // Note: we know that TimeSeries is sorted in acsending order.
            var enumerators = new List<IEnumerator<KeyValuePair<DateTime, double>>>();
            int n = 0; // number of remaining enumerators
            foreach (TimeSeries series in seriesCollection)
            {
                table.Columns.Add(series.Name, typeof(double));
                var enumerator = ((IEnumerable<KeyValuePair<DateTime, double>>)series).GetEnumerator();
                if (!enumerator.MoveNext())
                    enumerator = null;
                else
                    n += 1;
                enumerators.Add(enumerator);
            }

            object[] row = new object[n + 1];
            DateTime date = DateTime.MinValue;
            while (n > 0)
            {
                // Pass 1: find the minimum Date of all series.
                // If they are equal to the current date, stop.
                DateTime nextDate = DateTime.MaxValue;
                foreach (var enumerator in enumerators)
                {
                    if (enumerator != null)
                    {
                        if (enumerator.Current.Key == date)
                        {
                            nextDate = date;
                            break;
                        }
                        if (enumerator.Current.Key < nextDate)
                            nextDate = enumerator.Current.Key;
                    }
                }

                // Pass 2: create a record using nextDate.
                row[0] = nextDate;
                for (int i = 0; i < enumerators.Count; i++)
                {
                    var enumerator = enumerators[i];
                    if (enumerator != null)
                    {
                        if (enumerator.Current.Key == nextDate)
                        {
                            row[i + 1] = enumerator.Current.Value;
                            if (!enumerator.MoveNext())
                            {
                                enumerators[i] = null;
                                n -= 1;
                            }
                        }
                    }
                }

                // Add record.
                table.Rows.Add(row);
                date = nextDate.AddDays(1);
            }
            return table;
        }

        public static TimeSeries LoadHistoricalData(string fileName, string seriesName)
        {
            TimeSeries ts = new TimeSeries();
            ts.Name = seriesName;

            using (Stream stream = File.OpenRead(fileName))
            using (TextReader reader = new StreamReader(stream))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    string[] fields = line.Split(',');
                    if (fields.Length == 2)
                    {
                        DateTime date;
                        if (DateTime.TryParseExact(fields[0], "yyyy-MM-dd", 
                            CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
                        {
                            double value;
                            if (!double.TryParse(fields[1], out value))
                                value = double.NaN;
                            ts[date] = value;
                        }
                    }
                }
            }
            return ts;
        }
    }
}
