module.exports = function(grunt) {
	
	grunt.initConfig({
		copy: {
			numericjs: {
				src: 'bower_components/numeric-1.2.6/index.js',
				dest: 'scripts/numeric.js'
			},
			jquery: {
				src: 'bower_components/jquery/dist/jquery.min.js',
				dest: 'scripts/jquery.min.js'
			},
			canvasjs: {
				files: [
					{ src: 'src/jquery.canvasjs.js', dest: 'scripts/jquery.canvasjs.js' },
					{ src: 'src/canvasjs-1.8.0-beta4-mod.js', dest: 'scripts/canvasjs.js' }
				]
			},
			zingchart: {
				src: 'bower_components/zingchart/client/zingchart.min.js',
				dest: 'scripts/zingchart.min.js'
			}
		},
		clean: [ 'scripts' ]
	});
	
	// Load tasks.
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-clean');
	
	// Register tasks.
	grunt.registerTask('default', ['copy']);
	grunt.registerTask('help', 'Display test message.', function() {
		grunt.log.write('Hello world!\n').ok();
	});
	
};