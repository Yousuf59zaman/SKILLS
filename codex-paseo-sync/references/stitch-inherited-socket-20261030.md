# Historical Stitch socket investigation

A child process holding an inherited socket can keep a listener alive after the recorded owner exits. Check actual listener ownership before attributing a release failure to the operating system. The historical Stitch patch was retired. Follow the [current removal instruction](stitch-removal-20261030.md).
