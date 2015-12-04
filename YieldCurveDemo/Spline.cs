using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace YieldCurveDemo
{
    public class Spline
    {
        private double[] m_x;
        private double[] m_y;

        public Spline(double[] x, double[] y, int p)
        {
            if (x == null)
                throw new ArgumentNullException(nameof(x));
            if (y == null)
                throw new ArgumentNullException(nameof(y));
            if (x.Length != y.Length)
                throw new ArgumentException(nameof(x) + " and " + nameof(y) + " must have the same length");
            if (p < 2)
                throw new ArgumentException(nameof(p) + " must be >= 2");

            m_x = x;
            m_y = y;
            int n = x.Length;
            if (n < 2)
                return;

            if (p != 2)
                throw new NotImplementedException();

            // use the mid point
            Point[] controlPoints = new Point[n - 1];
            controlPoints[0].X=(x[0] + x[1]) / 2;
            controlPoints[0].Y = 0;
            for (int i=1;i<n-1;i++)
            {
                controlPoints[i].X = (x[i] + x[i + 1]) / 2;
                controlPoints[i].Y = y[i] + (controlPoints[i - 1].Y - y[i]) / (controlPoints[i - 1].X - x[i]) * (controlPoints[i].X - x[i]);
            }

            // 
        }
    }

    public struct Point
    {
        public double X { get; set; }
        public double Y { get; set; }
    }
}
