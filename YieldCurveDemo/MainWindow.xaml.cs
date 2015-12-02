using System.Windows;

namespace YieldCurveDemo
{
    /// <summary>
    /// Interaction logic for MainWindow.xaml
    /// </summary>
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
        }

        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            var assembly = System.Reflection.Assembly.GetExecutingAssembly();
            using (var stream = assembly.GetManifestResourceStream("YieldCurveDemo.index.html"))
            {
                var source = new System.IO.StreamReader(stream).ReadToEnd();
                wbMain.ObjectForScripting = new Server();
                wbMain.NavigateToString(source);
            }
            //string codeBase= System.Reflection.Assembly.GetExecutingAssembly().CodeBase;
            //Uri startPage = new Uri(new Uri(codeBase), "index.html");
            //wbMain.Navigate(startPage);
        }
    }
}
