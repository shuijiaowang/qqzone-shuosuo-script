// 自动滚动加载所有图片

export function autoScrollToLoadImages() {

    return new Promise((resolve) => {

        let lastScrollTop = 0;



        const scrollInterval = setInterval(() => {

            // 获取当前滚动位置

            const scrollTop = window.scrollY;

            const windowHeight = window.innerHeight;

            const documentHeight = document.body.offsetHeight;



            // 判断是否到底部

            const isBottom = (windowHeight + scrollTop) >= documentHeight - 10;



            // 如果滚动到底部或没有再滚动（说明到底了）

            if (isBottom) {

                clearInterval(scrollInterval);

                console.log('已滚动到底部，所有图片应该已加载');

                resolve();

                return;

            }

            // 向下滚动500像素

            window.scrollBy(0, 1000);
            lastScrollTop = scrollTop;
        }, 1000); // 每秒滚动一次，给图片加载留时间
    });
}

export function scrollBackToTop() {
    document.querySelector(".gb-operation-icon").click(); //回滚到最上面
}


